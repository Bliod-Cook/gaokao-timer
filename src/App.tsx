import { useState, useEffect } from "react";
import {getCurrentWindow, Window} from "@tauri-apps/api/window";
import { moveWindow, Position } from "@tauri-apps/plugin-positioner";
import { readTextFile, BaseDirectory } from "@tauri-apps/plugin-fs"; // Import FS functions
import "./App.css";
import {TrayIcon} from "@tauri-apps/api/tray";
import {defaultWindowIcon} from "@tauri-apps/api/app";
import {Menu} from "@tauri-apps/api/menu/menu";

// Helper function to parse YYYY/MM/DD and validate
function parseAndValidateDate(dateStr: string): Date | null {
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10); // Month is 1-based
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Create date object (Month is 0-based in JS Date)
  const date = new Date(year, month - 1, day);

  // Double-check if the created date matches the input parts
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null; // Invalid date like Feb 30th
  }

  // Set time to 00:00:00 to compare dates only
  date.setHours(0, 0, 0, 0);
  return date;
}

function App() {
  const [remainingDays, setRemainingDays] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const setupWindow = async () => {
      try {
        await moveWindow(Position.TopRight);
        const win = Window.getCurrent();
        await win.setIgnoreCursorEvents(true);
      } catch (err) {
        console.error("Error setting up window:", err);
        setError("Window setup failed.");
      }
    };

    const fetchAndCalculateDays = async () => {
      setError(null);
      setRemainingDays(null); // Indicate loading
      let targetDate: Date | null = null;

      try {
        // Try reading the date from time.txt in AppLocalData
        const dateStr = await readTextFile("time.txt", {
          baseDir: BaseDirectory.AppLocalData,
        });
        targetDate = parseAndValidateDate(dateStr);
        if (!targetDate) {
           console.warn("Invalid date format in time.txt, using default.");
        }
      } catch (err: any) {
        // Handle file not found or other read errors
        if (err?.message?.includes('os error 2') || err?.message?.includes('path not found')) {
          console.log("time.txt not found, using default date.");
        } else {
          console.error("Error reading time.txt:", err);
        }
        // Fallback handled below if targetDate is still null
      }

      // If reading failed or date was invalid, use fallback
      if (!targetDate) {
        const currentYear = new Date().getFullYear();
        targetDate = new Date(currentYear, 5, 7); // June 7th (Month is 0-based)
        targetDate.setHours(0, 0, 0, 0);
      }

      // Calculate remaining days
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Compare dates only

      const timeDiff = targetDate.getTime() - today.getTime();
      const days = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
      setRemainingDays(days >= 0 ? days : 0);
    };

    setupWindow();
    fetchAndCalculateDays(); // Initial fetch

    // Schedule daily update (slightly after midnight)
    const scheduleDailyUpdate = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      tomorrow.setHours(0, 1, 0, 0); // 00:01:00 tomorrow
      const timeToUpdate = tomorrow.getTime() - now.getTime();

      const timeoutId = setTimeout(() => {
        fetchAndCalculateDays();
        // After the first timeout, set an interval for subsequent days
        const intervalId = setInterval(fetchAndCalculateDays, 1000 * 60 * 60 * 24);
        // Return the interval cleanup
        return () => clearInterval(intervalId);
      }, timeToUpdate);

      // Return the timeout cleanup
      return () => clearTimeout(timeoutId);
    };

    const cleanupUpdate = scheduleDailyUpdate();

    // Cleanup function for useEffect
    return () => {
      if (typeof cleanupUpdate === 'function') {
        cleanupUpdate();
      }
    };
  }, []);

  useEffect(() => {
    async function run() {
      await TrayIcon.new({
        icon: await defaultWindowIcon() ?? "",
        menu: await Menu.new({
          items: [
            {
              id: "quit",
              text: "Quit",
              action: getCurrentWindow().close,
            }
          ]
        })
      })
    }
    run().then()
  }, []);

  return (
    <main className="container">
      {error ? (
        <div className="error-message">{error}</div>
      ) : remainingDays !== null ? (
        <div className="countdown">
          <span className="days">{remainingDays}</span>
          <span className="label">Days Remaining</span>
        </div>
      ) : (
        <p>Calculating...</p>
      )}
    </main>
  );
}

export default App;
