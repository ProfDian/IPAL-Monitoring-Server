// services/validationService.js
const Joi = require("joi");

// Schema validasi untuk data sensor
const readingSchema = Joi.object({
  ipal_id: Joi.number().integer().required(),
  device_id: Joi.string().optional().default("unknown"),
  inlet: Joi.object({
    ph: Joi.number().min(0).max(14).required(),
    tds: Joi.number().min(0).max(2000).required(),
    temperature: Joi.number().min(-10).max(60).required(),
  }).required(),
  outlet: Joi.object({
    ph: Joi.number().min(0).max(14).required(),
    tds: Joi.number().min(0).max(2000).required(),
    temperature: Joi.number().min(-10).max(60).required(),
  }).required(),
  // ⭐ TAMBAH INI - sensor_mapping
  sensor_mapping: Joi.object({
    inlet_ph: Joi.string().optional(),
    inlet_tds: Joi.string().optional(),
    inlet_temperature: Joi.string().optional(),
    outlet_ph: Joi.string().optional(),
    outlet_tds: Joi.string().optional(),
    outlet_temperature: Joi.string().optional(),
  }).optional(),
});

// Fungsi validasi
exports.validateReadingData = (data) => {
  return readingSchema.validate(data, { abortEarly: false });
};
