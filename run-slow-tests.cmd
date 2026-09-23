@echo off
setlocal

echo Running opt-in slow engine regression sentinels.
echo This can take several minutes or longer.
echo Each sentinel prints [SLOW START] and [SLOW END] markers.

set RUN_SLOW_ENGINE_REGRESSIONS=1
node --test tests\engine_regressions.test.mjs
