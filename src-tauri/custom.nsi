!include "MUI2.nsh"

Name "HoylandGenerator3"
OutFile "HoylandGenerator3-Installer.exe"
InstallDir "$PROGRAMFILES\HoylandGenerator3"
RequestExecutionLevel admin

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"

  ; Include the application files from the dist directory
  File /r "dist/*.*"

  ; Include the WebView2Loader DLL
  File "src-tauri/resources/WebView2Loader.dll"

  ; Include the CH340 drivers
  File /r "src-tauri/drivers/CH340/*.*"

  ; Install CH340 Driver based on system architecture
  StrCmp $ARCH "x64" +2
    ExecWait '"$INSTDIR\drivers\CH340\CH34032.EXE" /S' ; 32-bit
    Goto done
  ExecWait '"$INSTDIR\drivers\CH340\CH34164.EXE" /S' ; 64-bit
  done:
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\*.*"
  RMDir /r "$INSTDIR"
SectionEnd
