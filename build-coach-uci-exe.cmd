@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "SOURCE_FILE=%SCRIPT_DIR%tools\coach-uci-launcher\Program.cs"
set "OUTPUT_EXE=%SCRIPT_DIR%coach-uci.exe"
set "CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if not exist "%CSC%" (
    set "CSC=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if not exist "%CSC%" (
    >&2 echo Could not find the Windows C# compiler.
    >&2 echo Install the .NET Framework developer tools or build the launcher on a Windows machine with csc.exe available.
    exit /b 1
)

if not exist "%SOURCE_FILE%" (
    >&2 echo Could not find launcher source:
    >&2 echo %SOURCE_FILE%
    exit /b 1
)

"%CSC%" /nologo /target:exe /optimize+ /out:"%OUTPUT_EXE%" "%SOURCE_FILE%"
if errorlevel 1 exit /b 1

echo Built %OUTPUT_EXE%
