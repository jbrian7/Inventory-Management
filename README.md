[readme.md](https://github.com/user-attachments/files/33652875/readme.md)
# ⚡ Zap Zone QR Inventory System

A lightweight, mobile-first inventory management system designed specifically for family entertainment centers. It streamlines the tracking of novelties, prizes, and arcade parts using QR codes, mobile device cameras, and a local Raspberry Pi print server for on-demand thermal label printing.

## ✨ Features

*   **Mobile-First Design:** Built with a touch-friendly interface optimized for iPads and iPhones used by staff on the floor.
*   **Built-in QR Scanning:** Uses the device's native camera directly in the browser—no dedicated scanner hardware required.
*   **Quick Stock Adjustments:** Rapidly check-in or check-out inventory with large, easy-to-use buttons.
*   **Low-Stock Alerts:** Set custom thresholds for items to visually indicate when it's time to reorder.
*   **Local Network Printing:** A signed-in user prints a label through the Next.js server. The server sends it to a Raspberry Pi on the store LAN. The printer token stays on the server.

## 🛠️ Tech Stack

**Web Application:**
*   **Framework:** Next.js (App Router)
*   **UI/Styling:** Tailwind CSS, Shadcn UI
*   **Database:** PostgreSQL
*   **ORM:** Prisma
*   **QR Scanning:** `html5-qrcode` / `react-qr-reader`

**Print Server (Raspberry Pi):**
*   **Environment:** Node.js / Express
*   **QR Generation:** `qrcode` npm package
*   **Printer Protocol:** `escpos` or `node-dymo-printer` (depending on hardware)

## 🚀 Getting Started

This repository contains two main components: the Next.js web application and the Node.js print server for the Raspberry Pi.

### Prerequisites
*   Node.js (v18+)
*   PostgreSQL database (local or hosted via Supabase/Neon)
*   Raspberry Pi with Node.js installed (for the print server)
*   A supported thermal label printer (USB or Network)

### Part 1: Web Application Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/zap-zone-inventory.git
   cd zap-zone-inventory
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the root directory and add your database connection string:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/zapzone?schema=public"
   ```

4. **Initialize Database:**
   Push the Prisma schema to your database:
   ```bash
   npx prisma db push
   ```

5. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

### Part 2: Raspberry Pi Print Server Setup

Run the Next.js app on the store LAN. It calls the Pi. The iPad does not call the Pi, and the printer token is not stored in the browser. Details are in `pi-print-server/README.md`.

*Note: Ensure your thermal printer is connected to the Raspberry Pi and configured in CUPS if you use the default `lp` driver. No new printer is required.*

1. **Move to the print server directory:**
   ```bash
   cd pi-print-server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the print server with a token:**
   ```bash
   export PRINT_TOKEN="$(openssl rand -hex 32)"
   export LP_DEST=ZapZone
   node server.js
   ```
   Without `LP_DEST`, a request is a preview: the response has `printed: false`. *Tip: Use PM2 (`npm install -g pm2` then `pm2 start server.js --name zap-print`) to keep the print server running.*

4. **Point the app server at the Pi:**
   Set these in the Next.js environment, using the same token:
   ```bash
   PRINT_SERVER_URL="http://192.168.1.50:3001"
   PRINT_SERVER_TOKEN="<same value as PRINT_TOKEN>"
   ```
   Admins and managers can open Settings to see whether the Pi is reachable, whether a CUPS queue is configured, and to print a test label. Allow port 3001 only from the app server.

## 📱 Usage

1. **Add Items:** Navigate to the "Items" tab to add a new novelty. The system will automatically generate a unique QR code payload.
2. **Print Labels:** Open an item and click "Print Label". The app server sends the stored QR payload to the Pi. If the printer queue is not configured, the page says the label was not printed.
3. **Scan & Adjust:** Attach the printed label to the item's bin. Staff can navigate to the "Scan" tab, point their iPad camera at the label, and instantly add or deduct stock.

## 📄 License

This project is licensed under the MIT License.
