const axios = require("axios").default;
/**
 * @typedef {import('../../../../data/config').CproConfig} CproConfig
 */

/**
 * @param {Object} options
 * @param {string} options.username
 * @param {string} options.password
 * @param {CproConfig} options.cproConfig
 * @returns
 */
async function getAdminToken({ username, password, cproConfig }) {
  const payload = {
    client_id: "node-red-admin",
    grant_type: "password",
    scope: "*",
    username,
    password
  }

  const response = await axios.post(`${cproConfig.connector.httpPublicUrl}/auth/token`, payload)
  if (response.data.access_token) {
    return response.data.access_token
  }
  throw new Error("Failed to fetch admin token as it was not part of the received payload")
}

/**
 *
 * @param {Object} options
 * @param {string} options.adminToken
 * @param {CproConfig} options.cproConfig
 */
async function getDeplyedNodes({ adminToken, cproConfig }) {
  const response = await axios.get(`${cproConfig.connector.httpPublicUrl}/flows`, {
    headers: {
      Authorization: `Bearer ${adminToken}`
    }
  })
  return response.data
}

/**
 * @param {Object} options
 * @param {string} options.adminToken
 * @param {CproConfig} options.cproConfig
 * @param {Object} options.reconstructedFlow
 * @returns
 */
async function postReconstructedFlow({ adminToken, cproConfig, reconstructedFlow }) {
  const response = await axios.post(`${cproConfig.connector.httpPublicUrl}/flow`, reconstructedFlow, {
    headers: {
      Authorization: `Bearer ${adminToken}`
    }
  })
  return response
}

module.exports = {
  getAdminToken,
  getDeplyedNodes,
  postReconstructedFlow,
}