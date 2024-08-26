; Name of the installer
OutFile "Hoyland3-AlteredStates-Setup.exe"

; Set the default installation directory
InstallDir $PROGRAMFILES\Hoyland3-AlteredStates

; Request admin privileges
RequestExecutionLevel admin

; Set up the installer sections
Section "MainSection" SEC01
  ; Set the output path to the installation directory
  SetOutPath "$INSTDIR"

  ; Install the main application
  File "src-tauri\release\Hoyland3-AlteredStates.exe"

  ; Install the icons
  SetOutPath "$INSTDIR\icons"
  File "src-tauri\icons\*.png"
  File "src-tauri\icons\icon.icns"
  File "src-tauri\icons\icon.ico"

  ; Install the WebView2Loader.dll
  SetOutPath "$INSTDIR"
  File "src-tauri\resources\WebView2Loader.dll"

SectionEnd

Section "Install CH340 Driver" SEC02
  ; Determine the system architecture
  System::Call 'kernel32::IsWow64Process(i $R0, *i .r1)'
  StrCmp $1 1 +2
  StrCpy $R2 "CH34164.EXE" ; 64-bit system
  StrCmp $1 0 +2
  StrCpy $R2 "CH34032.exe" ; 32-bit system

  ; Install the CH340 driver silently
  ExecWait '"$INSTDIR\drivers\CH340\$R2" /silent'

SectionEnd

; Create uninstaller
Section "Uninstall"
  Delete "$INSTDIR\Hoyland3-AlteredStates.exe"
  Delete "$INSTDIR\WebView2Loader.dll"
  Delete "$INSTDIR\icons\*.*"
  RMDir "$INSTDIR\icons"
  RMDir "$INSTDIR"

  ; Optionally, uninstall the CH340 driver
  ; ExecWait '"$INSTDIR\drivers\CH340\$R2" /uninstall /silent'
SectionEnd

; Shortcuts
Section "Shortcuts" SEC03
  CreateDirectory "$SMPROGRAMS\Hoyland3-AlteredStates"
  CreateShortCut "$SMPROGRAMS\Hoyland3-AlteredStates\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$SMPROGRAMS\Hoyland3-AlteredStates\Hoyland3-AlteredStates.lnk" "$INSTDIR\Hoyland3-AlteredStates.exe"
SectionEnd

; Page settings
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

; Default installation path
InstallDir "$PROGRAMFILES\Hoyland3-AlteredStates"

; Show the finish page
!insertmacro MUI_PAGE_FINISH
