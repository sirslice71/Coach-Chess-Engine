@echo off
setlocal

for %%f in (tests\*.test.mjs) do (
    node --test %%f
    if errorlevel 1 exit /b 1
)
