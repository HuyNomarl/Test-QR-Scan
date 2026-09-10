/**
 * Face Recognition Controller
 *
 * Face embeddings are generated on the CLIENT (face-api.js in browser)
 * and sent to the API as float arrays. The server stores and compares them.
 * This avoids sending raw camera frames over the network.
 */

const db = require('../config/database');
const { AppError } = require('../utils/AppError');

const CONFIDENCE_THRESHOLD = parseFloat(process.env.FACE_CONFIDENCE_THRESHOLD || '0.85');

/**
 * Cosine similarity between two embedding vectors.
 * Returns a value 0–1 where 1 = identical.
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ─── POST /api/face/register ───────────────────────────── */
const registerFace = async (req, res, next) => {
  try {
    const { employee_id, embedding } = req.body;

    if (!employee_id || !Array.isArray(embedding) || embedding.length < 128)
      throw new AppError('VALIDATION_ERROR',
        'employee_id and a valid embedding array (≥128 floats) are required.', 400);

    // Verify employee
    const emp = await db.query(
      'SELECT employee_id FROM employees WHERE employee_id = $1 AND is_active = TRUE',
      [employee_id]
    );
    if (!emp.rows.length)
      throw new AppError('NOT_FOUND', 'Employee not found.', 404);

    // Upsert the embedding
    const result = await db.query(
      `INSERT INTO face_embeddings (employee_id, embedding, model_version)
       VALUES ($1, $2, 'face-api-v1')
       ON CONFLICT (employee_id) DO UPDATE
         SET embedding = $2, updated_at = NOW(), is_active = TRUE
       RETURNING id, employee_id, created_at, updated_at`,
      [employee_id, JSON.stringify(embedding)]
    );

    return res.status(201).json({
      success: true,
      message: 'Face embedding registered.',
      data: result.rows[0],
    });
  } catch (err) { next(err); }
};

/* ─── POST /api/face/verify ─────────────────────────────── */
const verifyFace = async (req, res, next) => {
  try {
    const { embedding, latitude, longitude, device_id } = req.body;

    if (!Array.isArray(embedding) || embedding.length < 128)
      throw new AppError('VALIDATION_ERROR', 'Valid embedding array required.', 400);

    // Load all active embeddings
    const stored = await db.query(
      `SELECT fe.employee_id, fe.embedding, e.full_name
       FROM face_embeddings fe
       JOIN employees e ON e.employee_id = fe.employee_id
       WHERE fe.is_active = TRUE AND e.is_active = TRUE`
    );

    if (!stored.rows.length)
      throw new AppError('NO_FACES', 'No registered faces in the system.', 400);

    // Find best match
    let bestMatch = null;
    let bestScore = 0;

    for (const row of stored.rows) {
      const storedEmbedding = Array.isArray(row.embedding)
        ? row.embedding
        : JSON.parse(row.embedding);
      const score = cosineSimilarity(embedding, storedEmbedding);
      if (score > bestScore) { bestScore = score; bestMatch = row; }
    }

    const confidence = Math.round(bestScore * 1000) / 1000;

    if (bestScore < CONFIDENCE_THRESHOLD || !bestMatch) {
      return res.status(401).json({
        success: false,
        error: 'FACE_NOT_RECOGNIZED',
        message: `Face not recognized (confidence: ${confidence}, threshold: ${CONFIDENCE_THRESHOLD}).`,
        confidence,
      });
    }

    // Return recognized employee info (caller will then do check-in)
    return res.json({
      success: true,
      message: `Face recognized: ${bestMatch.full_name}`,
      data: {
        employee_id: bestMatch.employee_id,
        employee_name: bestMatch.full_name,
        confidence,
      },
    });
  } catch (err) { next(err); }
};

module.exports = { registerFace, verifyFace };
