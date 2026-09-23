@echo off
setlocal

echo Running opt-in slow engine regression sentinels.
echo This can take several minutes or longer.
echo Each sentinel prints [SLOW START] and [SLOW END] markers.

if /i "%~1"=="/position" goto position_filter
if not "%~1"=="" echo Filtering tests with pattern: %*

set RUN_SLOW_ENGINE_REGRESSIONS=1
if "%~1"=="" (
    node --test tests\engine_regressions.test.mjs
) else (
    node --test --test-name-pattern="%*" tests\engine_regressions.test.mjs
)
exit /b %errorlevel%

:position_filter
if "%~2"=="" goto position_usage

echo Filtering slow positions with label pattern: %~2
set "RUN_SLOW_POSITION_PATTERN=%~2"
set RUN_SLOW_ENGINE_REGRESSIONS=1
node --test --test-name-pattern="preserve current depth snapshots" tests\engine_regressions.test.mjs
exit /b %errorlevel%

:position_usage
echo Usage: run-slow-tests.cmd /position "label text"
exit /b 1
