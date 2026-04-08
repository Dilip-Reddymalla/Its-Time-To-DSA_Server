const axios = require('axios');

const LC_GRAPHQL_URL = 'https://leetcode.com/graphql';

const RECENT_SUBMISSIONS_QUERY = `
  query recentAcSubmissions($username: String!, $limit: Int!) {
    recentAcSubmissionList(username: $username, limit: $limit) {
      id
      title
      titleSlug
      timestamp
    }
  }
`;

/**
 * Fetch the last N accepted submissions for a LeetCode username.
 * Returns array of { id, title, titleSlug, timestamp }
 */
const verifyLeetCodeSubmissions = async (username, limit = 50) => {
  try {
    const response = await axios.post(
      LC_GRAPHQL_URL,
      {
        query: RECENT_SUBMISSIONS_QUERY,
        variables: { username, limit },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://leetcode.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'x-csrftoken': 'nocheck',
          'Cookie': 'csrftoken=nocheck',
        },
        timeout: 8000,
      }
    );

    const submissions = response.data?.data?.recentAcSubmissionList;
    if (!submissions) {
      console.warn(`⚠️  No submissions data returned for user: ${username}`);
      return [];
    }

    // Add statusDisplay for compatibility
    return submissions.map((s) => ({ ...s, statusDisplay: 'Accepted' }));
  } catch (err) {
    console.error(`❌ LeetCode API error for ${username}:`, err.message);
    throw new Error(`Could not fetch LeetCode submissions: ${err.message}`);
  }
};

/**
 * Validate that a LeetCode username exists.
 */
const validateLeetCodeUser = async (username) => {
  try {
    const query = `
      query getUserProfile($username: String!) {
        matchedUser(username: $username) {
          username
          submitStats {
            acSubmissionNum { difficulty count }
          }
        }
      }
    `;

    const response = await axios.post(
      LC_GRAPHQL_URL,
      { query, variables: { username } },
      {
        headers: { 'Content-Type': 'application/json', 'Referer': 'https://leetcode.com' },
        timeout: 5000,
      }
    );

    const user = response.data?.data?.matchedUser;
    return !!user;
  } catch {
    return null; // Indeterminate, not definitely invalid
  }
};

module.exports = { verifyLeetCodeSubmissions, validateLeetCodeUser };
