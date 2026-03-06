/**
 * ========================================
 * REPORT SERVICE V4 (FIXED + PDFKit)
 * ========================================
 */

const { db, admin } = require("../config/firebase-config");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const reportService = {
  /**
   * Fetch water quality data dengan filter
   */
  fetchWaterQualityData: async (filters) => {
    const {
      ipal_id = 1,
      start_date,
      end_date,
      parameters = ["ph", "tds", "temperature"],
      location = "both",
    } = filters;

    try {
      console.log("📊 Fetching water quality data with filters:", filters);

      let query = db
        .collection("water_quality_readings")
        .where("ipal_id", "==", parseInt(ipal_id));

      if (start_date) {
        const startTimestamp = admin.firestore.Timestamp.fromDate(
          new Date(start_date + "T00:00:00Z"),
        );
        query = query.where("timestamp", ">=", startTimestamp);
      }

      if (end_date) {
        const endTimestamp = admin.firestore.Timestamp.fromDate(
          new Date(end_date + "T23:59:59Z"),
        );
        query = query.where("timestamp", "<=", endTimestamp);
      }

      query = query.orderBy("timestamp", "desc").limit(1000);

      const snapshot = await query.get();

      if (snapshot.empty) {
        return [];
      }

      const data = [];
      snapshot.forEach((doc) => {
        const reading = doc.data();

        const row = {
          timestamp: reading.timestamp?.toDate
            ? reading.timestamp.toDate().toISOString()
            : null,
          reading_id: doc.id,
        };

        if (location === "both" || location === "inlet") {
          parameters.forEach((param) => {
            row[`inlet_${param}`] = reading.inlet?.[param] || null;
          });
        }

        if (location === "both" || location === "outlet") {
          parameters.forEach((param) => {
            row[`outlet_${param}`] = reading.outlet?.[param] || null;
          });
        }

        data.push(row);
      });

      console.log(`✅ Fetched ${data.length} readings`);
      return data;
    } catch (error) {
      console.error("❌ Error fetching data:", error);
      throw error;
    }
  },

  /**
   * Calculate summary statistics
   */
  calculateSummary: (data, parameters) => {
    if (!data || data.length === 0) {
      return null;
    }

    const summary = {
      total_readings: data.length,
      period_start: data[data.length - 1]?.timestamp,
      period_end: data[0]?.timestamp,
      parameters: {},
    };

    parameters.forEach((param) => {
      const inletValues = data
        .map((d) => d[`inlet_${param}`])
        .filter((v) => v != null);

      if (inletValues.length > 0) {
        summary.parameters[`inlet_${param}`] = {
          avg: (
            inletValues.reduce((a, b) => a + b, 0) / inletValues.length
          ).toFixed(2),
          min: Math.min(...inletValues).toFixed(2),
          max: Math.max(...inletValues).toFixed(2),
          count: inletValues.length,
        };
      }

      const outletValues = data
        .map((d) => d[`outlet_${param}`])
        .filter((v) => v != null);

      if (outletValues.length > 0) {
        summary.parameters[`outlet_${param}`] = {
          avg: (
            outletValues.reduce((a, b) => a + b, 0) / outletValues.length
          ).toFixed(2),
          min: Math.min(...outletValues).toFixed(2),
          max: Math.max(...outletValues).toFixed(2),
          count: outletValues.length,
        };
      }

      if (
        summary.parameters[`inlet_${param}`] &&
        summary.parameters[`outlet_${param}`]
      ) {
        const inletAvg = parseFloat(summary.parameters[`inlet_${param}`].avg);
        const outletAvg = parseFloat(summary.parameters[`outlet_${param}`].avg);

        if (param !== "ph" && param !== "temperature") {
          const removal = ((inletAvg - outletAvg) / inletAvg) * 100;
          summary.parameters[`${param}_removal`] = removal.toFixed(2) + "%";
        }
      }
    });

    return summary;
  },

  /**
   * Generate CSV content (returns STRING)
   */
  generateCSV: (data) => {
    if (!data || data.length === 0) {
      throw new Error("No data to export");
    }

    const headers = Object.keys(data[0]);
    let csv = "\ufeff"; // BOM for UTF-8 Excel compatibility
    csv += headers.join(",") + "\n";

    data.forEach((row) => {
      const values = headers.map((header) => {
        const value = row[header];
        if (value == null) return "";
        if (
          typeof value === "string" &&
          (value.includes(",") || value.includes('"'))
        ) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csv += values.join(",") + "\n";
    });

    return csv;
  },

  /**
   * Generate Excel file (returns BUFFER)
   */
  generateExcel: async (data, summary, filters) => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "IPAL Monitoring System";
      workbook.created = new Date();

      // Sheet 1: Summary
      const summarySheet = workbook.addWorksheet("Summary");
      summarySheet.columns = [
        { header: "Metric", key: "metric", width: 35 },
        { header: "Value", key: "value", width: 30 },
      ];

      summarySheet.addRow({
        metric: "Report Generated",
        value: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
      });
      summarySheet.addRow({
        metric: "Period",
        value: `${filters.start_date} to ${filters.end_date}`,
      });
      summarySheet.addRow({
        metric: "Total Readings",
        value: summary.total_readings,
      });
      summarySheet.addRow({ metric: "", value: "" });

      summarySheet.addRow({ metric: "Parameter Statistics", value: "" });
      Object.entries(summary.parameters).forEach(([key, stats]) => {
        if (typeof stats === "object" && stats !== null) {
          summarySheet.addRow({ metric: key.toUpperCase(), value: "" });
          summarySheet.addRow({ metric: "  Average", value: stats.avg });
          summarySheet.addRow({ metric: "  Minimum", value: stats.min });
          summarySheet.addRow({ metric: "  Maximum", value: stats.max });
          summarySheet.addRow({ metric: "  Count", value: stats.count });
        } else {
          summarySheet.addRow({ metric: key.toUpperCase(), value: stats });
        }
      });

      summarySheet.getRow(1).font = { bold: true, size: 12 };
      summarySheet.getRow(5).font = { bold: true, size: 11 };
      summarySheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      // Sheet 2: Raw Data
      const dataSheet = workbook.addWorksheet("Raw Data");

      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        dataSheet.columns = headers.map((header) => ({
          header: header.toUpperCase().replace(/_/g, " "),
          key: header,
          width: 20,
        }));

        data.forEach((row) => {
          dataSheet.addRow(row);
        });

        dataSheet.getRow(1).font = { bold: true };
        dataSheet.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF4472C4" },
        };
        dataSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

        dataSheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: headers.length },
        };
      }

      // ✅ Return Buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;
    } catch (error) {
      console.error("❌ Error generating Excel:", error);
      throw error;
    }
  },

  /**
   * Generate PDF file using PDFKit (returns BUFFER)
   * Clean professional version without emojis
   */
  generatePDF: async (data, summary, filters) => {
    return new Promise((resolve, reject) => {
      try {
        console.log("Starting PDF generation...");
        console.log(`Data rows: ${data.length}`);

        // Create PDF document - COMPACT margins
        const doc = new PDFDocument({
          size: "A4",
          margins: { top: 30, bottom: 40, left: 40, right: 40 },
          bufferPages: true,
          info: {
            Title: "Water Quality Report",
            Author: "IPAL Monitoring System - UNDIP",
            Subject: "Water Quality Analysis Report",
            Keywords: "water quality, IPAL, monitoring, UNDIP",
          },
        });

        // Collect buffer chunks
        const chunks = [];

        doc.on("data", (chunk) => {
          chunks.push(chunk);
        });

        doc.on("end", () => {
          const buffer = Buffer.concat(chunks);
          console.log(`PDF generation complete: ${buffer.length} bytes`);
          resolve(buffer);
        });

        doc.on("error", (error) => {
          console.error("PDFKit error:", error);
          reject(error);
        });

        // ========================================
        // COLOR PALETTE
        // ========================================
        const colors = {
          primary: "#003d82", // UNDIP Blue
          secondary: "#4a90e2",
          accent: "#fbbf24", // Gold accent
          success: "#10b981",
          warning: "#f59e0b",
          danger: "#ef4444",
          dark: "#1f2937",
          gray: "#6b7280",
          lightGray: "#f3f4f6",
          white: "#ffffff",
        };

        // ========================================
        // PROFESSIONAL HEADER WITH LOGO
        // ========================================
        let yPosition = 20;

        // Header background with gradient effect
        doc.rect(0, 0, 612, 120).fill(colors.primary);
        doc.rect(0, 115, 612, 5).fill(colors.accent);

        // Logo image
        const logoPath = path.join(__dirname, "..", "Undip.png");
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 30, 12, { width: 80, height: 80 });
        }

        // Title and subtitle
        doc
          .fillColor(colors.white)
          .fontSize(18)
          .font("Helvetica-Bold")
          .text("Water Quality Parameters Report", 120, 14);

        doc
          .fontSize(10)
          .font("Helvetica")
          .text(
            "IPAL Environmental Engineering - Universitas Diponegoro",
            120,
            38,
          );

        doc
          .fontSize(8)
          .font("Helvetica")
          .text(
            "Jl. Prof. Soedharto, S.H. Tembalang, Semarang, Indonesia, 1269",
            120,
            54,
          );

        doc
          .fontSize(8)
          .font("Helvetica")
          .text("GKB Building, Faculty of Engineering, Undip", 120, 67);

        doc
          .fontSize(8)
          .font("Helvetica")
          .text("Tel: +62 822-6121-2832", 120, 80);

        yPosition = 135;

        // ========================================
        // PROFESSIONAL INFO CARDS (3 columns)
        // ========================================
        const cardWidth = 166;
        const cardHeight = 60;
        const cardGap = 8;
        const cardStartX = 40;

        // Helper: draw card with border
        const drawCard = (x, y, bgColor, borderColor) => {
          doc.roundedRect(x, y, cardWidth, cardHeight, 6).fill(bgColor);
          doc
            .roundedRect(x, y, cardWidth, cardHeight, 6)
            .lineWidth(0.8)
            .strokeColor(borderColor)
            .stroke();
        };

        // Card 1: Period
        drawCard(cardStartX, yPosition, colors.lightGray, "#d1d5db");
        doc
          .fontSize(8)
          .fillColor(colors.gray)
          .font("Helvetica-Bold")
          .text("REPORT PERIOD", cardStartX + 12, yPosition + 10, {
            width: cardWidth - 24,
          });
        doc
          .fontSize(10)
          .fillColor(colors.dark)
          .font("Helvetica-Bold")
          .text(filters.start_date || "-", cardStartX + 12, yPosition + 26, {
            width: cardWidth - 24,
          });
        doc
          .fontSize(8)
          .fillColor(colors.gray)
          .font("Helvetica")
          .text(
            "to  " + (filters.end_date || "-"),
            cardStartX + 12,
            yPosition + 42,
            { width: cardWidth - 24 },
          );

        // Card 2: Total Readings
        const card2X = cardStartX + cardWidth + cardGap;
        drawCard(card2X, yPosition, "#e0f2fe", "#93c5fd");
        doc
          .fontSize(8)
          .fillColor(colors.gray)
          .font("Helvetica-Bold")
          .text("TOTAL READINGS", card2X + 12, yPosition + 10, {
            width: cardWidth - 24,
          });
        doc
          .fontSize(24)
          .fillColor(colors.primary)
          .font("Helvetica-Bold")
          .text(
            summary.total_readings.toString(),
            card2X + 12,
            yPosition + 26,
            { width: cardWidth - 24 },
          );
        doc
          .fontSize(8)
          .fillColor(colors.gray)
          .font("Helvetica")
          .text("readings", card2X + 12, yPosition + 46, {
            width: cardWidth - 24,
          });

        // Card 3: Report Date
        const card3X = cardStartX + (cardWidth + cardGap) * 2;
        drawCard(card3X, yPosition, "#fef3c7", "#fcd34d");
        doc
          .fontSize(8)
          .fillColor(colors.gray)
          .font("Helvetica-Bold")
          .text("GENERATED ON", card3X + 12, yPosition + 10, {
            width: cardWidth - 24,
          });
        doc
          .fontSize(10)
          .fillColor(colors.dark)
          .font("Helvetica-Bold")
          .text(
            new Date().toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              timeZone: "Asia/Jakarta",
            }),
            card3X + 12,
            yPosition + 28,
            { width: cardWidth - 24 },
          );
        doc
          .fontSize(8)
          .fillColor(colors.gray)
          .font("Helvetica")
          .text(
            new Date().toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Jakarta",
            }) + " WIB",
            card3X + 12,
            yPosition + 44,
            { width: cardWidth - 24 },
          );

        yPosition += cardHeight + 20;

        // ========================================
        // HELPER: Draw section title with underline
        // ========================================
        const drawSectionTitle = (title, y, color) => {
          doc
            .fontSize(12)
            .fillColor(colors.dark)
            .font("Helvetica-Bold")
            .text(title, 40, y);
          doc
            .strokeColor(color)
            .lineWidth(2.5)
            .moveTo(40, y + 18)
            .lineTo(40 + doc.widthOfString(title) + 10, y + 18)
            .stroke();
          return y + 28;
        };

        // ========================================
        // STATISTICS TABLE
        // ========================================
        yPosition = drawSectionTitle(
          "PARAMETER STATISTICS",
          yPosition,
          colors.primary,
        );

        const statsHeaders = ["Parameter", "Average", "Min", "Max", "Count"];
        const statsColX = [40, 230, 320, 400, 480];
        const statsColW = [190, 90, 80, 80, 72];
        const statsTableW = 532;
        const statsRowH = 22;

        // Draw stats table header
        const drawStatsHeader = (y) => {
          doc.rect(40, y, statsTableW, statsRowH).fill(colors.primary);
          doc.fontSize(9).font("Helvetica-Bold").fillColor(colors.white);
          statsHeaders.forEach((header, i) => {
            doc.text(header, statsColX[i] + 6, y + 7, {
              width: statsColW[i] - 12,
              align: i === 0 ? "left" : "center",
            });
          });
          return y + statsRowH;
        };

        yPosition = drawStatsHeader(yPosition);

        let rowAlt = true;
        Object.entries(summary.parameters).forEach(([key, stats]) => {
          if (typeof stats === "object" && stats !== null) {
            if (yPosition > 720) {
              doc.addPage();
              yPosition = 40;
              yPosition = drawStatsHeader(yPosition);
              rowAlt = true;
            }

            // Row background
            doc
              .rect(40, yPosition, statsTableW, statsRowH)
              .fill(rowAlt ? "#f0f4fa" : colors.white);
            // Row border
            doc
              .rect(40, yPosition, statsTableW, statsRowH)
              .lineWidth(0.3)
              .strokeColor("#d1d5db")
              .stroke();
            rowAlt = !rowAlt;

            // Vertical grid lines
            statsColX.forEach((cx, i) => {
              if (i > 0) {
                doc
                  .moveTo(cx, yPosition)
                  .lineTo(cx, yPosition + statsRowH)
                  .lineWidth(0.3)
                  .strokeColor("#d1d5db")
                  .stroke();
              }
            });

            doc.fontSize(9).font("Helvetica-Bold").fillColor(colors.dark);
            const paramName = key.toUpperCase().replace(/_/g, " ");
            doc.text(paramName, statsColX[0] + 6, yPosition + 7, {
              width: statsColW[0] - 12,
            });

            doc.font("Helvetica").fontSize(9).fillColor("#374151");
            doc.text(stats.avg, statsColX[1] + 6, yPosition + 7, {
              width: statsColW[1] - 12,
              align: "center",
            });
            doc.text(stats.min, statsColX[2] + 6, yPosition + 7, {
              width: statsColW[2] - 12,
              align: "center",
            });
            doc.text(stats.max, statsColX[3] + 6, yPosition + 7, {
              width: statsColW[3] - 12,
              align: "center",
            });
            doc.text(stats.count.toString(), statsColX[4] + 6, yPosition + 7, {
              width: statsColW[4] - 12,
              align: "center",
            });

            yPosition += statsRowH;
          }
        });

        // Outer border for stats table
        doc
          .rect(
            40,
            yPosition -
              statsRowH *
                Object.entries(summary.parameters).filter(
                  ([, s]) => typeof s === "object",
                ).length -
              statsRowH,
            statsTableW,
            statsRowH *
              (Object.entries(summary.parameters).filter(
                ([, s]) => typeof s === "object",
              ).length +
                1),
          )
          .lineWidth(0.8)
          .strokeColor(colors.primary)
          .stroke();

        // ========================================
        // REMOVAL EFFICIENCY
        // ========================================
        const removalStats = Object.entries(summary.parameters).filter(
          ([key, value]) =>
            typeof value === "string" && key.includes("removal"),
        );

        if (removalStats.length > 0) {
          yPosition += 20;
          yPosition = drawSectionTitle(
            "REMOVAL EFFICIENCY",
            yPosition,
            colors.success,
          );

          const removalBoxWidth = Math.min(
            180,
            Math.floor(532 / removalStats.length) - 8,
          );
          const removalBoxHeight = 70;
          const removalTotalW = removalStats.length * (removalBoxWidth + 8) - 8;
          const removalStartX = 40 + (532 - removalTotalW) / 2;

          removalStats.forEach(([key, value], index) => {
            const xPos = removalStartX + index * (removalBoxWidth + 8);

            doc
              .roundedRect(
                xPos,
                yPosition,
                removalBoxWidth,
                removalBoxHeight,
                8,
              )
              .fill("#ecfdf5");
            doc
              .roundedRect(
                xPos,
                yPosition,
                removalBoxWidth,
                removalBoxHeight,
                8,
              )
              .lineWidth(1.2)
              .strokeColor("#34d399")
              .stroke();

            // Icon bar at top
            doc.rect(xPos, yPosition, removalBoxWidth, 4).fill("#34d399");

            doc
              .fontSize(9)
              .fillColor(colors.dark)
              .font("Helvetica-Bold")
              .text(
                key.toUpperCase().replace(/_REMOVAL/g, ""),
                xPos + 8,
                yPosition + 14,
                { width: removalBoxWidth - 16, align: "center" },
              );

            doc
              .fontSize(20)
              .fillColor("#059669")
              .font("Helvetica-Bold")
              .text(value, xPos + 8, yPosition + 34, {
                width: removalBoxWidth - 16,
                align: "center",
              });
          });

          yPosition += removalBoxHeight + 12;
        }

        // ========================================
        // DATA TABLE - RECENT READINGS (PROFESSIONAL)
        // ========================================
        if (yPosition > 560) {
          doc.addPage();
          yPosition = 40;
        } else {
          yPosition += 14;
        }

        yPosition = drawSectionTitle(
          "RECENT READINGS DATA",
          yPosition,
          colors.secondary,
        );

        // Table config
        const tblX = 40;
        const tblW = 532;
        const tblRowH = 20;
        const tblHeaderH = 24;
        const colDefs = [
          { label: "No.", width: 32, align: "center" },
          { label: "Timestamp", width: 110, align: "left" },
          { label: "pH In", width: 68, align: "center" },
          { label: "TDS In", width: 72, align: "center" },
          { label: "pH Out", width: 68, align: "center" },
          { label: "TDS Out", width: 78, align: "center" },
          { label: "Temp Out", width: 104, align: "center" },
        ];

        // Calculate column X positions
        let runningX = tblX;
        colDefs.forEach((col) => {
          col.x = runningX;
          runningX += col.width;
        });

        // Draw data table header
        const drawDataHeader = (y) => {
          // Header background
          doc.rect(tblX, y, tblW, tblHeaderH).fill(colors.primary);

          // Header text
          doc.fontSize(8.5).font("Helvetica-Bold").fillColor(colors.white);
          colDefs.forEach((col) => {
            doc.text(col.label, col.x + 4, y + 8, {
              width: col.width - 8,
              align: col.align,
            });
          });

          // Header vertical dividers (subtle white lines)
          colDefs.forEach((col, i) => {
            if (i > 0) {
              doc
                .moveTo(col.x, y + 4)
                .lineTo(col.x, y + tblHeaderH - 4)
                .lineWidth(0.5)
                .strokeColor("rgba(255,255,255,0.3)")
                .stroke();
            }
          });

          return y + tblHeaderH;
        };

        yPosition = drawDataHeader(yPosition);
        let dataTableTopY = yPosition - tblHeaderH;

        const recentData = data.slice(0, 15);
        let rowColorAlt = true;

        recentData.forEach((row, idx) => {
          // Page break check
          if (yPosition > 740) {
            // Draw outer border for current page portion
            doc
              .rect(tblX, dataTableTopY, tblW, yPosition - dataTableTopY)
              .lineWidth(0.8)
              .strokeColor(colors.primary)
              .stroke();

            doc.addPage();
            yPosition = 40;
            yPosition = drawDataHeader(yPosition);
            dataTableTopY = yPosition - tblHeaderH;
            rowColorAlt = true;
          }

          // Row background
          const rowBg = rowColorAlt ? "#f0f4fa" : colors.white;
          doc.rect(tblX, yPosition, tblW, tblRowH).fill(rowBg);
          rowColorAlt = !rowColorAlt;

          // Horizontal row line
          doc
            .moveTo(tblX, yPosition + tblRowH)
            .lineTo(tblX + tblW, yPosition + tblRowH)
            .lineWidth(0.3)
            .strokeColor("#d1d5db")
            .stroke();

          // Vertical grid lines
          colDefs.forEach((col, i) => {
            if (i > 0) {
              doc
                .moveTo(col.x, yPosition)
                .lineTo(col.x, yPosition + tblRowH)
                .lineWidth(0.3)
                .strokeColor("#d1d5db")
                .stroke();
            }
          });

          const textY = yPosition + 6;
          doc.font("Helvetica").fontSize(8).fillColor(colors.dark);

          // No.
          doc.text((idx + 1).toString(), colDefs[0].x + 4, textY, {
            width: colDefs[0].width - 8,
            align: "center",
          });

          // Timestamp
          const timestamp = row.timestamp
            ? new Date(row.timestamp).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Jakarta",
              })
            : "N/A";
          doc.text(timestamp, colDefs[1].x + 6, textY, {
            width: colDefs[1].width - 10,
          });

          // pH In
          doc.text(
            row.inlet_ph != null ? row.inlet_ph.toFixed(2) : "-",
            colDefs[2].x + 4,
            textY,
            { width: colDefs[2].width - 8, align: "center" },
          );

          // TDS In
          doc.text(
            row.inlet_tds != null ? row.inlet_tds.toFixed(0) : "-",
            colDefs[3].x + 4,
            textY,
            { width: colDefs[3].width - 8, align: "center" },
          );

          // pH Out
          doc.text(
            row.outlet_ph != null ? row.outlet_ph.toFixed(2) : "-",
            colDefs[4].x + 4,
            textY,
            { width: colDefs[4].width - 8, align: "center" },
          );

          // TDS Out
          doc.text(
            row.outlet_tds != null ? row.outlet_tds.toFixed(0) : "-",
            colDefs[5].x + 4,
            textY,
            { width: colDefs[5].width - 8, align: "center" },
          );

          // Temp Out
          doc.text(
            row.outlet_temperature != null
              ? row.outlet_temperature.toFixed(1) + " °C"
              : "-",
            colDefs[6].x + 4,
            textY,
            { width: colDefs[6].width - 8, align: "center" },
          );

          yPosition += tblRowH;
        });

        // Outer border for data table (current/last page)
        doc
          .rect(tblX, dataTableTopY, tblW, yPosition - dataTableTopY)
          .lineWidth(1)
          .strokeColor(colors.primary)
          .stroke();

        // Row count note
        yPosition += 6;
        doc
          .fontSize(7.5)
          .fillColor(colors.gray)
          .font("Helvetica")
          .text(
            `Showing ${recentData.length} of ${data.length} most recent readings`,
            tblX,
            yPosition,
            { width: tblW, align: "right" },
          );

        // ========================================
        // ADD PAGE NUMBERS AND FOOTER
        // ========================================
        const pages = doc.bufferedPageRange();
        const totalPages = pages.count;
        const pageW = doc.page.width;
        const pageH = doc.page.height;

        for (let i = 0; i < totalPages; i++) {
          doc.switchToPage(i);

          // Temporarily remove bottom margin so footer text does not trigger a new page
          const savedBottom = doc.page.margins.bottom;
          doc.page.margins.bottom = 0;

          // Footer line
          doc
            .strokeColor(colors.primary)
            .lineWidth(1)
            .moveTo(40, pageH - 45)
            .lineTo(572, pageH - 45)
            .stroke();

          const footerLine1 = `Page ${i + 1} of ${totalPages}`;
          const footerLine2 =
            "Water Quality Monitoring System - IPAL Teknik Lingkungan | Universitas Diponegoro";

          doc
            .fontSize(8)
            .fillColor(colors.gray)
            .font("Helvetica")
            .text(footerLine1, 0, pageH - 38, {
              align: "center",
              width: pageW,
              lineBreak: false,
            });

          doc
            .fontSize(7)
            .fillColor(colors.gray)
            .font("Helvetica")
            .text(footerLine2, 0, pageH - 26, {
              align: "center",
              width: pageW,
              lineBreak: false,
            });

          // Restore margin and reset cursor to prevent extra page creation
          doc.page.margins.bottom = savedBottom;
          doc.x = doc.page.margins.left;
          doc.y = doc.page.margins.top;
        }

        console.log("PDF content written, finalizing...");

        // Finalize PDF
        doc.end();

        console.log("doc.end() called");
      } catch (error) {
        console.error("Error in PDF generation:", error);
        console.error("Stack:", error.stack);
        reject(error);
      }
    });
  },
};

module.exports = reportService;

console.log("reportService (v4 - PDFKit) loaded");
