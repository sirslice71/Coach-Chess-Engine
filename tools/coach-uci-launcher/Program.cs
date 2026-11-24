using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace CoachUciLauncher
{
    internal static class Program
    {
        private const uint JobObjectLimitKillOnJobClose = 0x00002000;
        private const int JobObjectExtendedLimitInformation = 9;

        [StructLayout(LayoutKind.Sequential)]
        private struct JobObjectBasicLimitInformation
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct IoCounters
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JobObjectExtendedLimitInformationData
        {
            public JobObjectBasicLimitInformation BasicLimitInformation;
            public IoCounters IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr CreateJobObject(
            IntPtr jobAttributes,
            string name
        );

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetInformationJobObject(
            IntPtr job,
            int informationClass,
            IntPtr information,
            uint informationLength
        );

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool AssignProcessToJobObject(
            IntPtr job,
            IntPtr process
        );

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);

        private static IntPtr CreateKillOnCloseJob()
        {
            IntPtr job = CreateJobObject(IntPtr.Zero, null);

            if (job == IntPtr.Zero)
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "Coach UCI launcher could not create its process job."
                );
            }

            var limits =
                new JobObjectExtendedLimitInformationData();
            limits.BasicLimitInformation.LimitFlags =
                JobObjectLimitKillOnJobClose;

            int size = Marshal.SizeOf(limits);
            IntPtr information = Marshal.AllocHGlobal(size);

            try
            {
                Marshal.StructureToPtr(limits, information, false);

                if (!SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    information,
                    (uint)size
                ))
                {
                    throw new Win32Exception(
                        Marshal.GetLastWin32Error(),
                        "Coach UCI launcher could not configure its process job."
                    );
                }
            }
            catch
            {
                CloseHandle(job);
                throw;
            }
            finally
            {
                Marshal.FreeHGlobal(information);
            }

            return job;
        }

        private static int Main()
        {
            string launcherDirectory =
                AppDomain.CurrentDomain.BaseDirectory;

            string uciScriptPath =
                Path.Combine(
                    launcherDirectory,
                    "uci.js"
                );

            if (!File.Exists(uciScriptPath))
            {
                Console.Error.WriteLine(
                    "Coach UCI launcher could not find uci.js next to coach-uci.exe."
                );

                return 1;
            }

            var startInfo =
                new ProcessStartInfo
                {
                    FileName = "node",
                    Arguments = "\"" + uciScriptPath + "\"",
                    WorkingDirectory = launcherDirectory,
                    UseShellExecute = false,
                    RedirectStandardInput = false,
                    RedirectStandardOutput = false,
                    RedirectStandardError = false
                };

            IntPtr job = IntPtr.Zero;
            Process child = null;

            try
            {
                job = CreateKillOnCloseJob();

                try
                {
                    child = Process.Start(startInfo);
                }
                catch (Win32Exception)
                {
                    Console.Error.WriteLine(
                        "Coach UCI launcher could not find Node.js on PATH."
                    );
                    Console.Error.WriteLine(
                        "Install Node.js LTS and make sure \"node\" is available on PATH,"
                    );
                    Console.Error.WriteLine(
                        "then run coach-uci.exe again."
                    );

                    return 1;
                }

                if (child == null)
                {
                    Console.Error.WriteLine(
                        "Coach UCI launcher could not start Node.js."
                    );

                    return 1;
                }

                if (!AssignProcessToJobObject(job, child.Handle))
                {
                    throw new Win32Exception(
                        Marshal.GetLastWin32Error(),
                        "Coach UCI launcher could not supervise Node.js."
                    );
                }

                child.WaitForExit();
                return child.ExitCode;
            }
            catch (Win32Exception error)
            {
                Console.Error.WriteLine(error.Message);

                return 1;
            }
            finally
            {
                if (child != null)
                {
                    try
                    {
                        if (!child.HasExited)
                        {
                            child.Kill();
                            child.WaitForExit();
                        }
                    }
                    catch
                    {
                        // Closing the job handle below is the final cleanup.
                    }

                    child.Dispose();
                }

                if (job != IntPtr.Zero)
                {
                    CloseHandle(job);
                }
            }
        }
    }
}
