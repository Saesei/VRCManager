Unicode true

!ifndef VERSION
  !define VERSION "0.3.0"
!endif

!ifndef SOURCE_DIR
  !define SOURCE_DIR "..\out\VRCManager-win32-x64"
!endif

!define APP_NAME "VRChat Fallback Manager"
!define APP_EXE "VRCManager.exe"
!define PUBLISHER "Saesei"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\VRCManager"

Name "${APP_NAME}"
Caption "${APP_NAME} Setup"

OutFile "..\out\VRCManager-${VERSION}-Setup.exe"

InstallDir "$PROGRAMFILES64\VRCManager"
InstallDirRegKey HKLM "${UNINSTALL_KEY}" "InstallLocation"

RequestExecutionLevel admin

Icon "..\fallback.ico"
UninstallIcon "..\fallback.ico"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "FileDescription" "${APP_NAME} Installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright © ${PUBLISHER}"

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON "..\fallback.ico"
!define MUI_UNICON "..\fallback.ico"

!define MUI_WELCOMEPAGE_TITLE "Welcome to ${APP_NAME} Setup"
!define MUI_WELCOMEPAGE_TEXT "This will install ${APP_NAME} on your computer.$\r$\n$\r$\nClick Next to continue."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "Install"

  SetOutPath "$INSTDIR"

  File /r "${SOURCE_DIR}\*.*"

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"

  CreateShortcut \
    "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" \
    "$INSTDIR\${APP_EXE}" \
    "" \
    "$INSTDIR\${APP_EXE}" \
    0

  CreateShortcut \
    "$DESKTOP\${APP_NAME}.lnk" \
    "$INSTDIR\${APP_EXE}" \
    "" \
    "$INSTDIR\${APP_EXE}" \
    0

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'

  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair" 1

SectionEnd

Section "Uninstall"

  Delete "$DESKTOP\${APP_NAME}.lnk"

  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"

  DeleteRegKey HKLM "${UNINSTALL_KEY}"

  RMDir /r "$INSTDIR"

SectionEnd