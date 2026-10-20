# ClipNacre — 繁體中文

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [한국어](README.ko.md)

v0.2.0 新增原生 **macOS 版 ClipNacre**，提供 Apple Silicon 與 Intel 的 DMG/ZIP，支援剪貼簿歷史、截圖編輯、螢幕貼圖及本機 OCR。公開安裝檔名改用 clipnacre；Linux 內部套件與資料路徑維持相容。Mac 版尚未經 Apple 公證，請閱讀 [Mac 安裝與權限指南](../macos.md)。

v0.1.14 新增視覺化截圖文字辨識。按 **Super+Shift+S** 截圖，在編輯器中點擊 **從影像複製文字**（或按 **Ctrl+Shift+O**），即可在影像上查看辨識出的文字框。點擊單一詞語或拖曳選取一片區域，檢查並編輯結果後複製；**選取全部文字** 可恢復完整辨識結果。OCR 在本機執行，英文語言套件隨安裝包提供；中文需安裝 `tesseract-ocr-chi-tra` 或 `tesseract-ocr-chi-sim`，並在辨識對話框中選擇對應語言。已安裝的英文套件會與所選語言一起辨識混合文字。升級後請儲存工作、登出並重新登入。

![OCR v0.1.14](../screenshots/ocr-v0.1.14.png)

v0.1.13 在按下 Super+Shift+S 時凍結畫面，選取範圍與匯出使用同一張快照，保留當時可見的通知和選單。圖片歷史支援 PNG/JPEG 格式別名與錯誤標記的格式、BMP/WebP 像素轉換，以及單一本機圖片檔案。QQ 的實際複製流程仍需在桌面驗證。

v0.1.12 修復了 Super+V 剪貼簿面板不可見的問題，尤其是內容未變更時再次開啟的情況。 v0.1.11 修復了 Super+V 面板超出螢幕及再次開啟時位置錯誤的問題。面板會在目前應用程式中上次點擊的位置附近開啟，滑鼠移走也不影響；沒有可用紀錄時使用滑鼠目前位置。面板大小依可用螢幕區域調整，也可拖曳標題列移動。

v0.1.9 修復文字輸入：點擊「文字」即可在圖片上顯示帶游標的輸入框；點擊其他位置移動輸入框，按 Enter 完成。「淺色馬賽克」可自由塗畫，分別調整畫筆粗細和方塊大小；方塊為不透明的淺灰色與白色。「黑白濾鏡」是獨立的可復原開關。Super+Shift+S 和相機按鈕每次只顯示新的十字游標，不保留舊選框；拖曳後放開即可截圖，Escape 取消。截圖進入剪貼簿和可選歷史，使用「儲存影像」選擇檔案位置；Print Screen 保留 GNOME 原有截圖介面。

v0.1.8 新增可拖曳、縮放與調整透明度的螢幕貼圖、自動編號標記、可選取並移動/縮放/刪除的標註，以及本機 OCR 文字辨識。編輯器中的「貼到螢幕」可固定參考圖；「從影像複製文字」可選擇已安裝的辨識語言，檢查並編輯結果後複製。「設定 → 螢幕截圖匯出與 OCR」可選擇儲存資料夾、檔名格式及 OCR 語言。安裝包包含英文 OCR；其他語言需安裝對應的 Tesseract 語言套件。螢幕貼圖與歷史中的固定項目不同，鎖定螢幕、清除或停用擴充功能會關閉貼圖。

v0.1.6 支援 PNG/JPEG 圖片歷史、縮圖、釘選和貼上。點選標題列的相機按鈕，或按 Super+Shift+S，可使用 GNOME 的區域、視窗和全螢幕截圖工具。快捷鍵可在設定中修改或停用。啟用「關機時清空歷史記錄」後，文字、圖片、釘選項目和最近使用的表情僅保存在記憶體中，關機、重新啟動、登出或重新載入擴充功能時都會清空。啟用時也會刪除現有的磁碟歷史記錄，但不刪除 GNOME 的截圖檔案。

適用於 Ubuntu GNOME 的 Windows 風格 Super+V 選擇器，提供剪貼簿歷史、表情符號、顏文字、符號和本機 GIF 收藏。所有內容保留在本機，無遙測或執行時網路請求。

Ubuntu 24.04 / GNOME 46 · Ubuntu 26.04 / GNOME 50 · Debian 13 / GNOME 48 · Wayland · x86-64 & ARM64

## 初次安裝

下載 [v0.2.0 安裝套件](https://github.com/LincolnGothic/clipnacre/releases/download/v0.2.0/clipnacre_0.2.0_linux_all.deb)，在套件所在資料夾中開啟終端機：

```sh
sudo apt install ./clipnacre_0.2.0_linux_all.deb
```

安裝後**儲存工作、登出並重新登入**，再以一般使用者執行以下命令（不使用 sudo）。第一個命令將通知快捷鍵設為 Super+M，讓本應用程式使用 Super+V；它會取代自訂通知快捷鍵。

```sh
gsettings set org.gnome.shell.keybindings toggle-message-tray "['<Super>m']"
gnome-extensions enable super-v-ubuntu@super-v-ubuntu.local
gnome-extensions info super-v-ubuntu@super-v-ubuntu.local
```

按 **Super+V**，標題應為 **ClipNacre 0.2.0**。

## 升級到 v0.2.0

下載上方的套件，在套件所在資料夾中執行同一個 apt 命令，即可覆蓋升級，無須先解除安裝。接著**儲存工作、登出並重新登入**，再按 **Super+V** 確認標題為 **ClipNacre 0.2.0**。語言與快捷鍵設定會保留，已儲存的文字歷史、釘選項目和最近使用的表情會遷移；設定為登出時清空的歷史會依設定清空。

以一般使用者檢查套件及 GNOME 目前載入的版本：

```sh
dpkg-query -W super-v-ubuntu
gnome-extensions info super-v-ubuntu@super-v-ubuntu.local
```

兩個版本都應為 **0.2.0**（擴充功能內部編號為 18）。若套件為新版而 GNOME 仍載入舊版，請先登出並重新登入。系統安裝的 Path 應為 `/usr/share/gnome-shell/extensions/super-v-ubuntu@super-v-ubuntu.local`；若指向使用者目錄，請備份並將該 UUID 資料夾移到擴充功能目錄之外，再登出登入。若 Super+V 沒有反應，可執行上方的 enable 命令；若開啟通知，檢查初次安裝中的通知快捷鍵命令。設定無法開啟時，可執行 `gnome-extensions prefs super-v-ubuntu@super-v-ubuntu.local`。

## v0.2.0 設定速查

按 Super+V，點選標題列的齒輪按鈕開啟「設定」。

| 功能 | 操作或設定位置 |
| --- | --- |
| 截圖 | 相機按鈕或 **Super+Shift+S**；截圖後重新開啟 Super+V 查看圖片歷史。需啟用剪貼簿歷史收集。 |
| 修改截圖快捷鍵 | **設定 → 桌面整合 → 截圖快捷鍵（GTK 格式）**；例如 `<Super><Shift>s`，套用修改，留空可停用。 |
| 關機清空歷史 | **設定 → 剪貼簿歷史 → 關機時清空歷史記錄**。預設關閉，也會在重新啟動、登出或重新載入擴充功能時清空。 |
| 切換語言 | **設定 → 外觀 → 語言**；立即生效。 |

啟用關機清空後，現有磁碟歷史會刪除，目前項目只保留在記憶體中；GNOME 在 Pictures/Screenshots 另存的截圖檔案不會刪除。

## 使用與語言

先點選目標輸入框，再按 **Super+V**。方向鍵選擇、Enter 插入、Esc 關閉；Ctrl+Tab 切換分頁，Ctrl+F 返回搜尋。表情符號每列顯示多個，可使用中文或英文名稱搜尋。設定可變更位置、快捷鍵、記錄和自動貼上。

同一個安裝套件支援英語、簡體中文、繁體中文、日語、西班牙語、法語和韓語。在 ClipNacre 的「設定 → 外觀 → 語言」中選擇，介面和本地化搜尋會立即更新，無須登出，也不會變更 Ubuntu 的語言。預設為「跟隨系統」；不支援的語言使用英語。語言名稱始終以原文顯示。類別按鈕橫向排列，可直接點選；使用箭頭或水平捲動查看更多類別，點選手掌按鈕選擇膚色。

在設定中新增本機 GIF 檔案。貼上目標必須支援圖片；動畫支援取決於應用程式。沒有線上 GIF 搜尋。剪貼簿歷史可能包含私人文字，持久歷史以明文儲存；詳情與完整測試狀態見 [英文文件](../../README.md) 和 [隱私說明](../../SECURITY.md)。
