/**
 * ========================================
 * REPORT CONTROLLER (REFACTORED)
 * ========================================
 */

// ⚡ Lazy load service to reduce cold start
let reportService;

const getReportService = () => {
  if (!reportService) {
    console.log("⚡ Loading reportService...");
    reportService = require("../services/reportService");
  }
  return reportService;
};

/**
 * GET /api/reports/export
 * Generate & download report
 */
exports.exportReport = async (req, res) => {
  try {
    const {
      format,
      start_date,
      end_date,
      ipal_id = 1,
      parameters,
      location = "both",
    } = req.query;

    console.log("📊 Export report request:", {
      format,
      start_date,
      end_date,
      ipal_id,
      parameters,
      location,
    });

    // Validation
    if (!format) {
      return res.status(400).json({
        success: false,
        message: "Format is required (csv, excel, or pdf)",
      });
    }

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "start_date and end_date are required",
      });
    }

    // Parse parameters
    const paramList = parameters
      ? parameters.split(",").map((p) => p.trim())
      : ["ph", "tds", "temperature"];

    const filters = {
      ipal_id,
      start_date,
      end_date,
      parameters: paramList,
      location,
    };

    // Fetch data
    console.log("🔍 Fetching data...");
    const service = getReportService();
    const data = await service.fetchWaterQualityData(filters);

    if (data.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No data found for the specified period",
      });
    }

    console.log(`✅ Found ${data.length} readings`);

    // Calculate summary
    const summary = service.calculateSummary(data, paramList);

    // Generate file based on format
    let fileContent;
    let contentType;
    let fileName;

    try {
      if (format === "csv") {
        console.log("📄 Generating CSV...");
        fileContent = service.generateCSV(data);
        contentType = "text/csv; charset=utf-8";
        fileName = `water_quality_report_${start_date}_${end_date}.csv`;

        console.log(`✅ CSV generated: ${fileName}`);
      } else if (format === "excel") {
        console.log("📊 Generating Excel...");
        fileContent = await service.generateExcel(data, summary, filters);
        contentType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        fileName = `water_quality_report_${start_date}_${end_date}.xlsx`;

        console.log(
          `✅ Excel generated: ${fileName} (${fileContent.length} bytes)`,
        );
      } else if (format === "pdf") {
        console.log("📄 Generating PDF...");
        fileContent = await service.generatePDF(data, summary, filters);
        contentType = "application/pdf";
        fileName = `water_quality_report_${start_date}_${end_date}.pdf`;

        // ⚠️ CRITICAL LOGS - HARUS MUNCUL!
        console.log(`✅ PDF buffer received: ${fileContent.length} bytes`);
        console.log(`🔍 Buffer is valid: ${Buffer.isBuffer(fileContent)}`);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid format. Use csv, excel, or pdf",
        });
      }

      // Validate file content
      if (!fileContent) {
        throw new Error(`${format.toUpperCase()} generation returned null`);
      }

      if (format !== "csv" && fileContent.length === 0) {
        throw new Error(
          `${format.toUpperCase()} generation returned empty buffer`,
        );
      }

      // ✅ FIX: Convert to proper Buffer for binary formats (Vercel compatibility)
      let responseBody;
      if (format === "csv") {
        responseBody = Buffer.from(fileContent, "utf8");
      } else {
        responseBody = Buffer.isBuffer(fileContent)
          ? fileContent
          : Buffer.from(fileContent);
      }

      console.log(
        `📤 Sending ${format.toUpperCase()}: ${fileName} (${responseBody.length} bytes)`,
      );

      // ✅ FIX: Set headers properly for Vercel serverless
      res.status(200);
      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`,
      );
      res.setHeader("Content-Length", responseBody.length);
      // ✅ FIX: Prevent Vercel/CDN from caching or transforming binary response
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("X-Content-Type-Options", "nosniff");

      // ✅ FIX: Use res.send(Buffer) instead of res.end(buffer, 'binary')
      // res.end(buffer, 'binary') is deprecated and breaks on Vercel serverless
      res.send(responseBody);

      console.log(`✅ ${format.toUpperCase()} sent successfully!`);
    } catch (genError) {
      console.error(`❌ Error generating ${format}:`, genError);
      console.error("Stack:", genError.stack);

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: `Failed to generate ${format} file`,
          error: genError.message,
        });
      }
    }
  } catch (error) {
    console.error("❌ Error in exportReport:", error);
    console.error("Stack:", error.stack);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to export report",
        error: error.message,
      });
    }
  }
};

/**
 * GET /api/reports/preview
 * Preview summary before download
 */
exports.previewReport = async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      ipal_id = 1,
      parameters,
      location = "both",
    } = req.query;

    console.log("👁️ Preview report request:", {
      start_date,
      end_date,
      ipal_id,
      parameters,
      location,
    });

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "start_date and end_date are required",
      });
    }

    const paramList = parameters
      ? parameters.split(",").map((p) => p.trim())
      : ["ph", "tds", "temperature"];

    const filters = {
      ipal_id,
      start_date,
      end_date,
      parameters: paramList,
      location,
    };

    const service = getReportService();
    const data = await service.fetchWaterQualityData(filters);

    if (data.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No data found for the specified period",
      });
    }

    const summary = service.calculateSummary(data, paramList);

    console.log(`✅ Preview generated: ${data.length} readings`);

    return res.status(200).json({
      success: true,
      preview: {
        ...summary,
        sample_data: data.slice(0, 5),
      },
    });
  } catch (error) {
    console.error("❌ Error in previewReport:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate preview",
      error: error.message,
    });
  }
};

// ⚠️ PENTING: Ini harus muncul saat start!
console.log("📦 reportController (v5 - final fix) loaded");
