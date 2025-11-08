# KEBA Wallbox PWA - Docker Deployment

## Voraussetzungen
- Docker und Docker Compose installiert
- Die Wallbox muss im gleichen Netzwerk erreichbar sein

## Installation und Start

### Option 1: Mit Docker Compose (empfohlen)
```bash
# Image bauen und Container starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f

# Container stoppen
docker-compose down
```

### Option 2: Mit Docker direkt
```bash
# Image bauen
docker build -t keba-wallbox-pwa .

# Container starten (mit host network für LAN-Zugriff)
docker run -d --name keba-wallbox --network host keba-wallbox-pwa

# Logs anzeigen
docker logs -f keba-wallbox

# Container stoppen
docker stop keba-wallbox
docker rm keba-wallbox
```

## Zugriff auf die App

Nach dem Start ist die App erreichbar unter:
- **Im LAN**: http://[IP-ADRESSE-DES-SERVERS]:5000
- **Lokal**: http://localhost:5000

## Konfiguration

1. Öffnen Sie die App im Browser
2. Gehen Sie zu **Einstellungen**
3. Tragen Sie die IP-Adresse Ihrer KEBA Wallbox ein
4. Optional: Konfigurieren Sie SmartHome Webhook-URLs
5. Speichern Sie die Einstellungen

## Logs einsehen

Die App verfügt über einen integrierten **Logs-Tab**, in dem Sie:
- Die Kommunikation zwischen App und Wallbox sehen
- Webhook-Aufrufe nachverfolgen können
- Den Log-Level einstellen können (Debug, Info, Warning, Error)

## Troubleshooting

### Wallbox nicht erreichbar
- Prüfen Sie, ob die Wallbox-IP korrekt ist
- Stellen Sie sicher, dass der Docker-Container im host network mode läuft
- Prüfen Sie die Firewall-Einstellungen

### Port bereits belegt
Wenn Port 5000 bereits belegt ist, ändern Sie in `docker-compose.yml`:
```yaml
ports:
  - "8080:5000"  # Nutzt Port 8080 statt 5000
```

## Update

```bash
# Neuestes Image bauen
docker-compose build

# Container neu starten
docker-compose up -d
```
