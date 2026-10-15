!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInstall
  CreateDirectory "$INSTDIR\resources"
  FileOpen $0 "$INSTDIR\resources\aioffice-native-host.json" w
  FileWrite $0 "{$\"name$\":$\"com.iapro.aioffice$\",$\"description$\":$\"AIOffice Chrome companion$\",$\"path$\":$\"../AIOffice Native Host.exe$\",$\"type$\":$\"stdio$\",$\"allowed_origins$\":[$\"chrome-extension://kcapmchomgbpjgdfdijhlnnjehmhdfdc/$\"]}"
  FileClose $0
  WriteRegStr HKCU "Software\Google\Chrome\NativeMessagingHosts\com.iapro.aioffice" "" "$INSTDIR\resources\aioffice-native-host.json"
!macroend

!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Google\Chrome\NativeMessagingHosts\com.iapro.aioffice" ""
  StrCmp $0 "$INSTDIR\resources\aioffice-native-host.json" 0 +2
    DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.iapro.aioffice"
  Delete "$INSTDIR\resources\aioffice-native-host.json"
!macroend
