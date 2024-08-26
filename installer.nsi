; Name of the installer
Outfile "HoylandGenerator3asl.exe"

; Default installation directory
InstallDir $PROGRAMFILES\Hoyland3-AlteredStates

; Page definitions
Page directory
Page instfiles

; Main installation section
Section "MainSection" SEC01

  ; Debugging: Start installation
  MessageBox MB_OK "Starting installation..."

  ; Set output path to the installation directory
  SetOutPath $INSTDIR

  ; Include all files in the NSIS bundle directory
  File /r "src-tauri/target/release/bundle/nsis/*.*"

  ; Copy WebView2 installer
  File /r "src-tauri/webview/webview2.exe"

  ; Copy CH340 drivers
  File /r "src-tauri/drivers/CH340/CH34032.exe"
  File /r "src-tauri/drivers/CH340/CH34164.EXE"

  ; Create a shortcut on the Desktop
  CreateShortcut "$DESKTOP\Hoyland3-AlteredStates.lnk" "$INSTDIR\Hoyland3-AlteredStates.exe"

  ; Create a Start Menu shortcut
  CreateDirectory "$SMPROGRAMS\Hoyland3-AlteredStates"
  CreateShortcut "$SMPROGRAMS\Hoyland3-AlteredStates\Hoyland3-AlteredStates.lnk" "$INSTDIR\Hoyland3-AlteredStates.exe"

  ; Debugging: Finished copying files and creating shortcuts
  MessageBox MB_OK "Finished copying files and creating shortcuts."

SectionEnd

; Install WebView2 runtime silently
Section "Install WebView2"
  MessageBox MB_OK "Installing WebView2..."
  ExecWait '"$INSTDIR\webview/webview2.exe" /silent /install'
  MessageBox MB_OK "WebView2 installation complete."
SectionEnd

; Install CH340 drivers based on system architecture
Section "Install CH340 Drivers"
  MessageBox MB_OK "Starting CH340 driver installation..."
  
  ; Check if the system is 64-bit
  ${If} ${RunningX64}
    MessageBox MB_OK "64-bit system detected. Installing 64-bit driver..."
    ExecWait '"$INSTDIR\drivers\CH340\CH34164.EXE" /S'
  ${Else}
    MessageBox MB_OK "32-bit system detected. Installing 32-bit driver..."
    ExecWait '"$INSTDIR\drivers\CH340\CH34032.exe" /S'
  ${EndIf}

  MessageBox MB_OK "CH340 driver installation complete."
SectionEnd

; Debugging: Installation complete
Section "FinalSection"
  MessageBox MB_OK "Installation process complete!"
SectionEnd
