using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;

namespace CoachUciLauncher
{
    internal static class Program
    {
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

            try
            {
                using (Process child = Process.Start(startInfo))
                {
                    if (child == null)
                    {
                        Console.Error.WriteLine(
                            "Coach UCI launcher could not start Node.js."
                        );

                        return 1;
                    }

                    child.WaitForExit();
                    return child.ExitCode;
                }
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
        }
    }
}
