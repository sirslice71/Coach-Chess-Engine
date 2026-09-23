@echo off
setlocal

echo Running opt-in slow engine regression sentinels.
echo This can take several minutes or longer.
echo Each sentinel prints [SLOW START] and [SLOW END] markers.
if not "%~1"=="" echo Filtering tests with pattern: %*

set RUN_SLOW_ENGINE_REGRESSIONS=1
if "%~1"=="" (
    node --test tests\engine_regressions.test.mjs
) else (
    node --test --test-name-pattern="%*" tests\engine_regressions.test.mjs
)
