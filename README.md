# Auktionshaus-Datenbank für WoW Forever

## Auf GitHub Pages veröffentlichen

1. Das ZIP entpacken. Den **Inhalt** in das Hauptverzeichnis eines GitHub-Repositorys hochladen und committen. Die Datei index.html und der Ordner vendor müssen auf derselben Ebene stehen.
2. Im Repository **Settings → Pages → Build and deployment** öffnen. Unter **Source** die Option **Deploy from a branch** wählen.
3. Den Branch mit den hochgeladenen Dateien (üblicherweise main) und den Ordner **/(root)** auswählen und speichern.
4. Sobald die Veröffentlichung abgeschlossen ist, die angezeigte Pages-Adresse in der Gilde teilen.

Die Dateien sind direkt veröffentlichbar. Alle Laufzeitdateien sind im Paket enthalten. Zum lokalen Test eignet sich jeder statische Webserver auf localhost. Die Anwendung benötigt für Web Crypto und die dauerhafte Browserablage HTTPS oder localhost.

## Vorhandene Daten weiterverwenden

Über „Marktchronik / Sicherung importieren“ eine Marktchronik.lua, ein SQLite-Archiv aus der früheren Desktop-Version oder eine frühere JSON-Sicherung auswählen. Der Import ergänzt das lokale Archiv. Die Seite startet ohne mitgelieferte Scans.

SQLite läuft in einem Web Worker. Das Browserprofil speichert eine Kopie der SQLite-Datenbank über IndexedDB für die Adresse dieser Website. Unter „Archiv sichern“ lässt sich jederzeit eine normale SQLite-Datei herunterladen. Vor dem Löschen von Browserdaten oder dem Wechsel von Browser, Gerät oder Pages-Adresse eine Sicherung anlegen. Der Scanimport funktioniert unabhängig von einem Interface-Reset. Im privaten Browsermodus kann das Archiv nach dem Schließen verschwinden.

## Ein Archiv für die Gilde bereitstellen (optional)

1. In der Anwendung über „Archiv sichern“ eine SQLite-Kopie herunterladen.
2. Nur wenn diese Daten für alle Besucher der Website zugänglich sein sollen, die Kopie als **gilde.sqlite** neben **index.html** ins Repository legen.
3. In **config.js** die Zeile auf `const guildArchive = "gilde.sqlite";` ändern und committen.

Beim Öffnen der Website werden die veröffentlichten Scans in das jeweilige lokale Archiv übernommen. Eine aktualisierte gilde.sqlite kann auf demselben Weg veröffentlicht werden. Eigene Importe eines Besuchers bleiben in seinem Browser. Es gibt keinen zentralen Schreibzugriff. Zum Deaktivieren den Dateinamen in config.js wieder leeren. Bereits importierte Kopien bleiben bei den Besuchern.

## Preisberechnung

Der Rezeptvergleich verwendet die Preise des jüngsten Scans für den ausgewählten Markt. Der 5-%-Wert ist der mengengewichtete durchschnittliche Stückpreis der günstigsten fünf Prozent aller angebotenen Einheiten. Der Grenzstapel zählt anteilig. Die Ansicht „Preisverlauf“ zeigt zusätzlich den Durchschnitt über das gesamte Angebot.

SQLite-Browserlaufzeit: sql.js 1.13.0 (Lizenz unter vendor/LICENSE-sql.js.txt). Rezeptdaten und Quellen sind unter „Datenstand und Berechnung“ in der Anwendung aufgeführt.
