; Custom NSIS installer script for Telegram Trading Bot
; This file provides additional installer customization

!macro customInstall
  ; Create additional shortcuts
  CreateShortCut "$DESKTOP\Telegram Trading Bot.lnk" "$INSTDIR\${PRODUCT_FILENAME}" "" "$INSTDIR\resources\app\electron\assets\icon.ico" 0
  
  ; Create Start Menu folder with additional shortcuts
  CreateDirectory "$SMPROGRAMS\Telegram Trading Bot"
  CreateShortCut "$SMPROGRAMS\Telegram Trading Bot\Telegram Trading Bot.lnk" "$INSTDIR\${PRODUCT_FILENAME}"
  CreateShortCut "$SMPROGRAMS\Telegram Trading Bot\User Guide.lnk" "$INSTDIR\README.txt"
  CreateShortCut "$SMPROGRAMS\Telegram Trading Bot\Uninstall.lnk" "$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe"
  
  ; Set file associations (optional)
  WriteRegStr HKCR ".ttb" "" "TelegramTradingBot.Document"
  WriteRegStr HKCR "TelegramTradingBot.Document" "" "Telegram Trading Bot Configuration"
  WriteRegStr HKCR "TelegramTradingBot.Document\DefaultIcon" "" "$INSTDIR\resources\app\electron\assets\icon.ico"
!macroend

!macro customUnInstall
  ; Remove additional shortcuts
  Delete "$DESKTOP\Telegram Trading Bot.lnk"
  RMDir /r "$SMPROGRAMS\Telegram Trading Bot"
  
  ; Remove registry entries
  DeleteRegKey HKCR ".ttb"
  DeleteRegKey HKCR "TelegramTradingBot.Document"
!macroend

!macro customHeader
  ; Custom installer header
  !echo "Building Telegram Trading Bot Installer..."
!macroend

!macro customInit
  ; Custom initialization
  SetShellVarContext all
!macroend
