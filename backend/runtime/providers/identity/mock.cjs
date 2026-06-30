"use strict";

/**
 * Mock identity provider.
 * Returns a fixed developer user and resolves org membership from the DB.
 * Use USE_MOCK_IDENTITY=true (default in mock/local modes).
 */

const MOCK_USER = {
  userId:    "mock-user-001",
  email:     process.env.MOCK_USER_EMAIL || "dev@example.com",
  name:      process.env.MOCK_USER_NAME  || "Dev User",
  roles:     ["ORG_ADMIN", "PROJECT_ADMIN"],
  isMock:    true,
};

function getUser(_req) {
  return MOCK_USER;
}

async function getOrgRole(_req, _orgId) {
  return "ORG_ADMIN";
}

async function getProjectRole(_req, _projectId) {
  return "PROJECT_ADMIN";
}

module.exports = { getUser, getOrgRole, getProjectRole };
