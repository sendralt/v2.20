"use strict";

const MAX_HISTORY = 50;

async function saveForecast(db, fingerprintHash, data) {
    const { rows } = await db.query(
        `INSERT INTO forecast_history
         (fingerprint_hash, location, species, clarity, is_boat, model_used, bite_probability, bite_rank, result)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, created_at`,
        [
            fingerprintHash,
            data.location || 'Unknown',
            data.species || null,
            data.clarity || null,
            data.isBoat || false,
            data.model_used || null,
            data.bite_probability ?? null,
            data.bite_rank || null,
            JSON.stringify(data.result)
        ]
    );

    // Enforce max per device
    await db.query(
        `DELETE FROM forecast_history
         WHERE fingerprint_hash = $1 AND id NOT IN (
           SELECT id FROM forecast_history
           WHERE fingerprint_hash = $1
           ORDER BY created_at DESC
           LIMIT $2
         )`,
        [fingerprintHash, MAX_HISTORY]
    );

    return rows[0];
}

async function getHistory(db, fingerprintHash, { limit = 20, offset = 0 } = {}) {
    const { rows } = await db.query(
        `SELECT id, created_at, location, species, clarity, is_boat, bite_probability, bite_rank
         FROM forecast_history
         WHERE fingerprint_hash = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [fingerprintHash, Math.min(limit, MAX_HISTORY), offset]
    );
    return rows;
}

async function getForecast(db, fingerprintHash, id) {
    const { rows } = await db.query(
        `SELECT * FROM forecast_history
         WHERE fingerprint_hash = $1 AND id = $2`,
        [fingerprintHash, id]
    );
    return rows[0] || null;
}

async function deleteForecast(db, fingerprintHash, id) {
    const { rowCount } = await db.query(
        `DELETE FROM forecast_history
         WHERE fingerprint_hash = $1 AND id = $2`,
        [fingerprintHash, id]
    );
    return rowCount > 0;
}

async function clearHistory(db, fingerprintHash) {
    const { rowCount } = await db.query(
        `DELETE FROM forecast_history WHERE fingerprint_hash = $1`,
        [fingerprintHash]
    );
    return rowCount;
}

module.exports = { saveForecast, getHistory, getForecast, deleteForecast, clearHistory };
