; Name of the installer (displayed in the installer window and in Add/Remove Programs)
Name "Hoyland Generator 3 by Altered States"

; Define the name of the installer and the output EXE file
Outfile "HoylandGeneratorInstaller.exe"

; Define the directory where the Tauri app and drivers will be installed
InstallDir $PROGRAMFILES\HoylandGenerator

; MUI (Modern User Interface) settings
!include "MUI2.nsh"

; Pages to be displayed
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

; Installer Icon and Branding
Icon "..\src-tauri\icons\icon.ico"
BrandingText "Hoyland Generator Installer"

; Ensure NSIS runs with administrator privileges
RequestExecutionLevel admin

; Define the installation section
Section "Install Tauri App"

  ; Set the output path to the installation directory
  SetOutPath $INSTDIR

  ; Copy the Tauri app files to the installation directory
  File /r "..\dist\*.*"

  ; Copy the drivers to the installation directory
  SetOutPath $INSTDIR\drivers\CH340
  File "..\src-tauri\drivers\CH340\CH34164.EXE"
  
  SetOutPath $INSTDIR\drivers\CP210x
  File "..\src-tauri\drivers\CP210x\CP21064.exe"

  ; Copy WebView2 installer if required
  SetOutPath $INSTDIR\webview
  File "..\src-tauri\webview\webview2.exe"

  ; Write the uninstaller to the installation directory
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Create a Start Menu folder
  CreateDirectory "$SMPROGRAMS\Hoyland Generator 3"

  ; Create a Start Menu shortcut to the application
  CreateShortCut "$SMPROGRAMS\Hoyland Generator 3\Hoyland Generator.lnk" "$INSTDIR\YourAppExecutable.exe"

  ; Create a Start Menu shortcut to uninstall the application
  CreateShortCut "$SMPROGRAMS\Hoyland Generator 3\Uninstall Hoyland Generator.lnk" "$INSTDIR\Uninstall.exe"

SectionEnd

Section "Install Drivers"

  ; Install the CH340 driver using pnputil silently
  ExecWait 'pnputil /add-driver "$INSTDIR\drivers\CH340\CH341SER.INF" /install /quiet'
  
  ; Install the CP210x driver silently
  ExecWait '"$INSTDIR\drivers\CP210x\CP21064.exe" /S'

  ; Install WebView2 silently from the bundled installer
  ExecWait '"$INSTDIR\webview\webview2.exe"'

SectionEnd

; Define the uninstall section
Section "Uninstall"

  ; Remove installed files
  Delete "$INSTDIR\drivers\CH340\CH34164.EXE"
  Delete "$INSTDIR\drivers\CP210x\CP21064.exe"
  Delete "$INSTDIR\webview\webview2.exe"
  Delete "$INSTDIR\*.*"

  ; Remove directories
  RMDir /r "$INSTDIR\drivers\CH340"
  RMDir /r "$INSTDIR\drivers\CP210x"
  RMDir /r "$INSTDIR\webview"
  RMDir /r "$INSTDIR"

  ; Delete the uninstaller itself
  Delete "$INSTDIR\Uninstall.exe"

  ; Remove the Start Menu shortcuts
  Delete "$SMPROGRAMS\Hoyland Generator 3\Hoyland Generator.lnk"
  Delete "$SMPROGRAMS\Hoyland Generator 3\Uninstall Hoyland Generator.lnk"

  ; Remove the Start Menu folder
  RMDir "$SMPROGRAMS\Hoyland Generator 3"

  ; Remove the installation directory
  RMDir "$INSTDIR"

SectionEnd
