/**
 * ========================================
 * REPORT SERVICE V4 (FIXED + PDFKit)
 * ========================================
 */

const { db, admin } = require("../config/firebase-config");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

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
        value: new Date().toLocaleString("id-ID"),
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
        doc.rect(0, 0, 612, 100).fill(colors.primary);
        doc.rect(0, 95, 612, 5).fill(colors.accent);

        // Logo placeholder (circle with UNDIP text)
        doc.circle(70, 50, 30).lineWidth(3).stroke(colors.white);

        doc
          .fontSize(10)
          .fillColor(colors.white)
          .font("Helvetica-Bold")
          .text("UNDIP", 50, 42, { width: 40, align: "center" });

        // Title and subtitle
        doc
          .fillColor(colors.white)
          .fontSize(22)
          .font("Helvetica-Bold")
          .text("LAPORAN KUALITAS AIR", 120, 25);

        doc
          .fontSize(11)
          .font("Helvetica")
          .text("IPAL Teknik Lingkungan", 120, 52);

        doc
          .fontSize(10)
          .font("Helvetica")
          .text("Universitas Diponegoro", 120, 70);

        yPosition = 115;

        // ========================================
        // PROFESSIONAL INFO CARDS (3 columns)
        // ========================================
        const cardWidth = 170;
        const cardHeight = 55;
        const cardGap = 6;
        const cardStartX = 40;

        // Card 1: Period
        doc
          .roundedRect(cardStartX, yPosition, cardWidth, cardHeight, 5)
          .fill(colors.lightGray);

        doc
          .fontSize(9)
          .fillColor(colors.gray)
          .font("Helvetica-Bold")
          .text("PERIODE", cardStartX + 10, yPosition + 10);

        doc
          .fontSize(10)
          .fillColor(colors.dark)
          .font("Helvetica-Bold")
          .text(`${filters.start_date}`, cardStartX + 10, yPosition + 26, {
            width: cardWidth - 20,
          });

        doc
          .fontSize(9)
          .fillColor(colors.gray)
          .font("Helvetica")
          .text("sampai", cardStartX + 10, yPosition + 40, {
            width: cardWidth - 20,
          });

        // Card 2: Total Readings
        doc
          .roundedRect(
            cardStartX + cardWidth + cardGap,
            yPosition,
            cardWidth,
            cardHeight,
            5,
          )
          .fill("#e0f2fe");

        doc
          .fontSize(9)
          .fillColor(colors.gray)
          .font("Helvetica-Bold")
          .text(
            "TOTAL DATA",
            cardStartX + cardWidth + cardGap + 10,
            yPosition + 10,
          );

        doc
          .fontSize(22)
          .fillColor(colors.primary)
          .font("Helvetica-Bold")
          .text(
            summary.total_readings.toString(),
            cardStartX + cardWidth + cardGap + 10,
            yPosition + 25,
          );

        // Card 3: Report Date
        doc
          .roundedRect(
            cardStartX + (cardWidth + cardGap) * 2,
            yPosition,
            cardWidth,
            cardHeight,
            5,
          )
          .fill("#fef3c7");

        doc
          .fontSize(9)
          .fillColor(colors.gray)
          .font("Helvetica-Bold")
          .text(
            "TANGGAL LAPORAN",
            cardStartX + (cardWidth + cardGap) * 2 + 10,
            yPosition + 10,
          );

        doc
          .fontSize(11)
          .fillColor(colors.dark)
          .font("Helvetica-Bold")
          .text(
            new Date().toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            }),
            cardStartX + (cardWidth + cardGap) * 2 + 10,
            yPosition + 28,
            { width: cardWidth - 20 },
          );

        yPosition += cardHeight + 15;

        // ========================================
        // STATISTICS TABLE - OPTIMIZED
        // ========================================
        doc
          .fontSize(13)
          .fillColor(colors.dark)
          .font("Helvetica-Bold")
          .text("STATISTIK PARAMETER", 40, yPosition);

        doc
          .strokeColor(colors.primary)
          .lineWidth(2.5)
          .moveTo(40, yPosition + 20)
          .lineTo(180, yPosition + 20)
          .stroke();

        yPosition += 28;

        // Compact table header with modern design
        doc.roundedRect(40, yPosition, 532, 22, 3).fill(colors.primary);

        const statsHeaders = ["Parameter", "Rata-rata", "Min", "Max", "Jumlah"];
        const statsColX = [48, 240, 330, 410, 490];
        const statsColW = [185, 80, 70, 70, 60];

        doc.fontSize(9).font("Helvetica-Bold").fillColor(colors.white);
        statsHeaders.forEach((header, i) => {
          doc.text(header, statsColX[i], yPosition + 7, {
            width: statsColW[i],
            align: i === 0 ? "left" : "center",
          });
        });

        yPosition += 22;

        // Statistics rows with better styling
        let rowAlt = true;
        Object.entries(summary.parameters).forEach(([key, stats]) => {
          if (typeof stats === "object" && stats !== null) {
            // Check page break
            if (yPosition > 720) {
              doc.addPage();
              yPosition = 40;

              // Repeat header on new page
              doc.roundedRect(40, yPosition, 532, 22, 3).fill(colors.primary);

              doc.fontSize(9).font("Helvetica-Bold").fillColor(colors.white);
              statsHeaders.forEach((header, i) => {
                doc.text(header, statsColX[i], yPosition + 7, {
                  width: statsColW[i],
                  align: i === 0 ? "left" : "center",
                });
              });
              yPosition += 22;
              rowAlt = true;
            }

            // Alternating row colors
            if (rowAlt) {
              doc.rect(40, yPosition, 532, 20).fill("#f9fafb");
            }
            rowAlt = !rowAlt;

            doc.fontSize(9).font("Helvetica-Bold").fillColor(colors.dark);

            // Parameter name
            const paramName = key.toUpperCase().replace(/_/g, " ");
            doc.text(paramName, statsColX[0], yPosition + 6, {
              width: statsColW[0],
            });

            doc.font("Helvetica").fontSize(9);
            doc.text(stats.avg, statsColX[1], yPosition + 6, {
              width: statsColW[1],
              align: "center",
            });
            doc.text(stats.min, statsColX[2], yPosition + 6, {
              width: statsColW[2],
              align: "center",
            });
            doc.text(stats.max, statsColX[3], yPosition + 6, {
              width: statsColW[3],
              align: "center",
            });
            doc.text(stats.count.toString(), statsColX[4], yPosition + 6, {
              width: statsColW[4],
              align: "center",
            });

            yPosition += 20;
          }
        });

        // Add bottom border to table
        doc
          .strokeColor(colors.gray)
          .lineWidth(0.5)
          .moveTo(40, yPosition)
          .lineTo(572, yPosition)
          .stroke();

        // ========================================
        // REMOVAL EFFICIENCY
        // ========================================
        const removalStats = Object.entries(summary.parameters).filter(
          ([key, value]) =>
            typeof value === "string" && key.includes("removal"),
        );

        if (removalStats.length > 0) {
          yPosition += 18;

          doc
            .fontSize(13)
            .fillColor(colors.dark)
            .font("Helvetica-Bold")
            .text("EFISIENSI REMOVAL", 40, yPosition);

          doc
            .strokeColor(colors.success)
            .lineWidth(2.5)
            .moveTo(40, yPosition + 20)
            .lineTo(180, yPosition + 20)
            .stroke();

          yPosition += 28;

          // Card layout for removal efficiency
          const removalBoxWidth = Math.floor(532 / removalStats.length);
          const removalBoxHeight = 65;

          removalStats.forEach(([key, value], index) => {
            const xPos = 40 + index * removalBoxWidth;

            // Rounded corners box
            doc
              .roundedRect(
                xPos + 2,
                yPosition,
                removalBoxWidth - 6,
                removalBoxHeight,
                5,
              )
              .fill("#d1fae5");

            // Add border
            doc
              .roundedRect(
                xPos + 2,
                yPosition,
                removalBoxWidth - 6,
                removalBoxHeight,
                5,
              )
              .stroke("#10b981");

            // Parameter name
            doc
              .fontSize(8)
              .fillColor(colors.dark)
              .font("Helvetica-Bold")
              .text(
                key.toUpperCase().replace(/_REMOVAL/g, ""),
                xPos + 8,
                yPosition + 18,
                { width: removalBoxWidth - 16, align: "center" },
              );

            // Removal percentage
            doc
              .fontSize(18)
              .fillColor(colors.success)
              .font("Helvetica-Bold")
              .text(value, xPos + 8, yPosition + 36, {
                width: removalBoxWidth - 16,
                align: "center",
              });
          });

          yPosition += removalBoxHeight + 10;
        }

        // ========================================
        // DATA TABLE - RECENT READINGS
        // ========================================
        // Check if we need new page
        if (yPosition > 600) {
          doc.addPage();
          yPosition = 40;
        } else {
          yPosition += 12;
        }

        doc
          .fontSize(13)
          .fillColor(colors.dark)
          .font("Helvetica-Bold")
          .text("DATA PEMBACAAN TERKINI", 40, yPosition);

        doc
          .strokeColor(colors.secondary)
          .lineWidth(2.5)
          .moveTo(40, yPosition + 20)
          .lineTo(210, yPosition + 20)
          .stroke();

        yPosition += 28;

        // Table with better spacing
        const tableTop = yPosition;
        const colWidths = [120, 65, 70, 65, 70, 75];
        const colX = [40, 160, 225, 295, 360, 435];
        const headers = [
          "Waktu",
          "pH In",
          "TDS In",
          "pH Out",
          "TDS Out",
          "Temp Out",
        ];

        // Header with modern design
        doc.roundedRect(40, tableTop, 532, 20, 3).fill(colors.primary);

        doc.fontSize(8).font("Helvetica-Bold").fillColor(colors.white);
        headers.forEach((header, i) => {
          doc.text(header, colX[i], tableTop + 6, {
            width: colWidths[i],
            align: i === 0 ? "left" : "center",
          });
        });

        yPosition = tableTop + 20;

        // Table rows - LIMIT TO 15 rows
        const recentData = data.slice(0, 15);
        let rowColor = true;

        doc.font("Helvetica").fontSize(7);

        recentData.forEach((row) => {
          // Check if need new page
          if (yPosition > 750) {
            doc.addPage();
            yPosition = 40;

            // Repeat table header
            doc.roundedRect(40, yPosition, 532, 20, 3).fill(colors.primary);

            doc.fontSize(8).font("Helvetica-Bold").fillColor(colors.white);
            headers.forEach((header, i) => {
              doc.text(header, colX[i], yPosition + 6, {
                width: colWidths[i],
                align: i === 0 ? "left" : "center",
              });
            });

            yPosition += 20;
            rowColor = true;
          }

          // Alternating row colors
          if (rowColor) {
            doc.rect(40, yPosition, 532, 16).fill("#f9fafb");
          }
          rowColor = !rowColor;

          doc.fillColor(colors.dark);

          const timestamp = row.timestamp
            ? new Date(row.timestamp).toLocaleString("id-ID", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "N/A";

          doc.text(timestamp, colX[0] + 2, yPosition + 4, {
            width: colWidths[0] - 4,
          });
          doc.text(
            row.inlet_ph != null ? row.inlet_ph.toFixed(2) : "-",
            colX[1],
            yPosition + 4,
            { width: colWidths[1], align: "center" },
          );
          doc.text(
            row.inlet_tds != null ? row.inlet_tds.toFixed(0) : "-",
            colX[2],
            yPosition + 4,
            { width: colWidths[2], align: "center" },
          );
          doc.text(
            row.outlet_ph != null ? row.outlet_ph.toFixed(2) : "-",
            colX[3],
            yPosition + 4,
            { width: colWidths[3], align: "center" },
          );
          doc.text(
            row.outlet_tds != null ? row.outlet_tds.toFixed(0) : "-",
            colX[4],
            yPosition + 4,
            { width: colWidths[4], align: "center" },
          );
          doc.text(
            row.outlet_temperature != null
              ? row.outlet_temperature.toFixed(1) + "°C"
              : "-",
            colX[5],
            yPosition + 4,
            { width: colWidths[5], align: "center" },
          );

          yPosition += 16;
        });

        // Add bottom border
        doc
          .strokeColor(colors.gray)
          .lineWidth(0.5)
          .moveTo(40, yPosition)
          .lineTo(572, yPosition)
          .stroke();

        // ========================================
        // ADD PAGE NUMBERS AND FOOTER
        // ========================================
        const pages = doc.bufferedPageRange();
        const totalPages = pages.count;
        const pageW = doc.page.width;
        const pageH = doc.page.height;

        for (let i = 0; i < totalPages; i++) {
          doc.switchToPage(i);

          // Reset cursor to safe position to avoid triggering auto page-add
          doc.x = doc.page.margins.left;
          doc.y = doc.page.margins.top;

          // Footer line
          doc
            .strokeColor(colors.primary)
            .lineWidth(1)
            .moveTo(40, pageH - 50)
            .lineTo(572, pageH - 50)
            .stroke();

          // Combined footer: "Halaman x/x | Water Quality Monitoring ... | Universitas Diponegoro"
          const footerLine1 = `Halaman ${i + 1} dari ${totalPages}`;
          const footerLine2 =
            "Water Quality Monitoring System - IPAL Teknik Lingkungan | Universitas Diponegoro";

          doc
            .fontSize(8)
            .fillColor(colors.gray)
            .font("Helvetica")
            .text(footerLine1, 0, pageH - 40, {
              align: "center",
              width: pageW,
              lineBreak: false,
            });

          doc
            .fontSize(7)
            .fillColor(colors.gray)
            .font("Helvetica")
            .text(footerLine2, 0, pageH - 28, {
              align: "center",
              width: pageW,
              lineBreak: false,
            });

          // CRITICAL: Reset cursor back to top to prevent PDFKit from creating new pages
          doc.x = doc.page.margins.left;
          doc.y = doc.page.margins.top;
        }

        console.log("PDF content written, finalizing...");

        // Flush all buffered pages before ending
        doc.flushPages();

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
