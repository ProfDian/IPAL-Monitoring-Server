/**
 * ========================================
 * SENSOR CONTROLLER (REFACTORED)
 * ========================================
 * Thin controller layer - delegates business logic to sensorService
 * All 11 exported functions preserved with original response shapes
 */

const sensorService = require("../services/sensorService");

// GET /api/sensors/readings
exports.getReadings = async (req, res) => {
  try {
    const readings = await sensorService.getReadings(req.query);

    return res.status(200).json({
      success: true,
      count: readings.length,
      data: readings,
    });
  } catch (error) {
    console.error("💥 Error fetching readings:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to fetch readings",
      error: error.message,
    });
  }
};

// GET /api/sensors/latest/:ipal_id
exports.getLatestReading = async (req, res) => {
  try {
    const { ipal_id } = req.params;
    const reading = await sensorService.getLatestReading(ipal_id);

    return res.status(200).json({
      success: true,
      data: reading,
    });
  } catch (error) {
    console.error("💥 Error fetching latest reading:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to fetch latest reading",
      error: error.message,
    });
  }
};

// GET /api/sensors
exports.getAllSensors = async (req, res) => {
  try {
    const result = await sensorService.getAllSensors(req.query);

    return res.status(200).json({
      success: true,
      count: result.count,
      online_count: result.online_count,
      offline_count: result.offline_count,
      data: result.sensors,
    });
  } catch (error) {
    console.error("💥 Error fetching sensors:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sensors",
      error: error.message,
    });
  }
};

// GET /api/sensors/:id
exports.getSensorById = async (req, res) => {
  try {
    const { id } = req.params;
    const sensor = await sensorService.getSensorById(id);

    return res.status(200).json({
      success: true,
      data: sensor,
    });
  } catch (error) {
    console.error("💥 Error fetching sensor:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sensor",
      error: error.message,
    });
  }
};

// PUT /api/sensors/:id
exports.updateSensor = async (req, res) => {
  try {
    const { id } = req.params;
    const sensor = await sensorService.updateSensor(id, req.body, req.user);

    return res.status(200).json({
      success: true,
      message: "Sensor updated successfully",
      data: sensor,
    });
  } catch (error) {
    console.error("💥 Error updating sensor:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to update sensor",
      error: error.message,
    });
  }
};

// GET /api/sensors/:id/status
exports.getSensorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = await sensorService.getSensorStatus(id);

    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("💥 Error checking sensor status:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to check sensor status",
      error: error.message,
    });
  }
};

// GET /api/sensors/ipal/:ipal_id
exports.getSensorsByIpal = async (req, res) => {
  try {
    const { ipal_id } = req.params;
    const result = await sensorService.getSensorsByIpal(ipal_id);

    return res.status(200).json({
      success: true,
      count: result.count,
      data: result.sensors,
    });
  } catch (error) {
    console.error("💥 Error fetching sensors by IPAL:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sensors",
      error: error.message,
    });
  }
};

// GET /api/sensors/:id/latest
exports.getLatestReadingBySensor = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await sensorService.getLatestReadingBySensor(id);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("💥 Error fetching latest reading:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to fetch latest reading",
      error: error.message,
    });
  }
};

// GET /api/sensors/:id/history
exports.getSensorHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit, start_date, end_date } = req.query;
    const result = await sensorService.getSensorHistory(id, {
      limit,
      start_date,
      end_date,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("💥 Error fetching sensor history:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sensor history",
      error: error.message,
    });
  }
};

// POST /api/sensors
exports.createSensor = async (req, res) => {
  try {
    const sensor = await sensorService.createSensor(req.body, req.user);

    return res.status(201).json({
      success: true,
      message: "Sensor created successfully",
      data: sensor,
    });
  } catch (error) {
    console.error("💥 Error creating sensor:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to create sensor",
      error: error.message,
    });
  }
};

// DELETE /api/sensors/:id
exports.deleteSensor = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await sensorService.deleteSensor(id, req.user);

    return res.status(200).json({
      success: true,
      message: `Sensor "${result.sensor_description}" deleted successfully`,
      data: {
        deleted_sensor_id: result.deleted_sensor_id,
        sensor_type: result.sensor_type,
        sensor_location: result.sensor_location,
        ipal_id: result.ipal_id,
      },
    });
  } catch (error) {
    console.error("💥 Error deleting sensor:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to delete sensor",
      error: error.message,
    });
  }
};

console.log("📦 sensorController loaded");
