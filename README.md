[readme.md](https://github.com/user-attachments/files/33652875/readme.md)
# ⚡ Zap Zone QR Inventory System

A lightweight, mobile-first inventory management system designed specifically for family entertainment centers. It streamlines the tracking of novelties, prizes, and arcade parts using QR codes, mobile device cameras, and a local Raspberry Pi print server for on-demand thermal label printing.

## ✨ Features

*   **Mobile-First Design:** Built with a touch-friendly interface optimized for iPads and iPhones used by staff on the floor.
*   **Built-in QR Scanning:** Uses the device's native camera directly in the browser—no dedicated scanner hardware required.
*   **Quick Stock Adjustments:** Rapidly check-in or check-out inventory with large, easy-to-use buttons.
*   **Low-Stock Alerts:** Set custom thresholds for items to visually indicate when it's time to reorder.
*   **Local Network Printing:** Integrates with a Raspberry Pi to automatically generate and print QR code labels to a thermal printer over your local network.

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

*Note: Ensure your thermal printer is connected via USB to the Raspberry Pi and properly configured in CUPS if required by your specific printer model.*

1. **Move to the print server directory:**
   ```bash
   cd pi-print-server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the print server:**
   ```bash
   node server.js
   ```
   *Tip: Use a process manager like PM2 (`npm install -g pm2` then `pm2 start server.js`) to keep the print server running automatically on the Pi's startup.*

4. **Connect App to Printer:**
   Open the settings page in your deployed Web App and enter the local IP address of your Raspberry Pi (e.g., `http://192.168.1.50:3001`).

## 📱 Usage

1. **Add Items:** Navigate to the "Items" tab to add a new novelty. The system will automatically generate a unique QR code payload.
2. **Print Labels:** Select an item and click "Print Label" to send a print job to the Raspberry Pi.
3. **Scan & Adjust:** Attach the printed label to the item's bin. Staff can navigate to the "Scan" tab, point their iPad camera at the label, and instantly add or deduct stock.

## 📄 License

This project is licensed under the MIT License.
