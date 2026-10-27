/**
 * Threads API - GraphQL mutations for blocking/unblocking users.
 */

import { ThreadsAPI } from '../shared/constants.js';

const { ENDPOINT: API_ENDPOINT, IG_APP_ID, DOC_IDS } = ThreadsAPI;

/**
 * Block a user on Threads.
 *
 * @param {string} userId - The user ID to block
 * @param {{csrftoken: string, fb_dtsg: string, lsd: string}} tokens - Auth tokens
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function blockUser(userId, tokens) {
  const variables = {
    user_id: userId,
    container_module: 'ig_text_post_permalink',
    media_id: null,
    ranking_info_token: null,
    barcelona_source_quote_post_id: null,
    barcelona_source_reply_id: null,
    is_messaging_nua: null,
    consistent_thread_fbid: null,
  };

  return makeGraphQLRequest(DOC_IDS.block, variables, tokens, 'useTHUserBlockMutation');
}

/**
 * Unblock a user on Threads.
 *
 * @param {string} userId - The user ID to unblock
 * @param {{csrftoken: string, fb_dtsg: string, lsd: string}} tokens - Auth tokens
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function unblockUser(userId, tokens) {
  const variables = {
    user_id: userId,
    container_module: 'ig_text_post_permalink',
  };

  return makeGraphQLRequest(DOC_IDS.unblock, variables, tokens, 'useTHUserUnblockMutation');
}

/**
 * Make a GraphQL request to Threads API.
 */
async function makeGraphQLRequest(docId, variables, tokens, friendlyName) {
  const { csrftoken, fb_dtsg, lsd } = tokens;

  const body = new URLSearchParams({
    av: '0',
    __user: '0',
    __a: '1',
    __req: 'a',
    __hs: '',
    dpr: '1',
    __ccg: 'EXCELLENT',
    __rev: '',
    __s: '',
    __hsi: '',
    __comet_req: '29',
    fb_dtsg: fb_dtsg || '',
    jazoest: '2' + Math.floor(Math.random() * 10000),
    lsd: lsd || '',
    __spin_r: '',
    __spin_b: 'trunk',
    __spin_t: Math.floor(Date.now() / 1000).toString(),
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: friendlyName,
    variables: JSON.stringify(variables),
    server_timestamps: 'true',
    doc_id: docId,
  });

  const headers = {
    accept: '*/*',
    'content-type': 'application/x-www-form-urlencoded',
    'x-csrftoken': csrftoken,
    'x-fb-friendly-name': friendlyName,
    'x-fb-lsd': lsd || '',
    'x-ig-app-id': IG_APP_ID,
  };

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers,
      body: body.toString(),
      credentials: 'include',
    });

    if (!response.ok) {
      // eslint-disable-next-line no-undef -- build-time constant from esbuild define
      if (typeof __TB_DEV_LOG__ !== 'undefined' && __TB_DEV_LOG__) {
        const raw = await response.text().catch(() => '(unreadable)');
        logFailure(friendlyName, variables.user_id, { httpStatus: response.status, body: raw });
      }
      return {
        success: false,
        error: `HTTP ${response.status}`,
        status: response.status,
      };
    }

    const data = await response.json();

    // Check for GraphQL errors
    if (data.errors && data.errors.length > 0) {
      // eslint-disable-next-line no-undef -- build-time constant from esbuild define
      if (typeof __TB_DEV_LOG__ !== 'undefined' && __TB_DEV_LOG__) {
        logFailure(friendlyName, variables.user_id, { httpStatus: response.status, body: data });
      }
      return {
        success: false,
        error: data.errors[0].message || 'GraphQL error',
        graphqlErrors: data.errors,
      };
    }

    // Check for successful response
    // The exact response structure may vary, but we check for no errors
    // eslint-disable-next-line no-undef -- build-time constant from esbuild define
    if (typeof __TB_DEV_LOG__ !== 'undefined' && __TB_DEV_LOG__) {
      // console.debug: hidden unless DevTools shows "Verbose". Lets a "200 but
      // not applied" body be compared against a genuine success.
      console.debug('[TB-dev] request ok', friendlyName, 'userId=', variables.user_id, data);
    }
    return { success: true, data };
  } catch (err) {
    // eslint-disable-next-line no-undef -- build-time constant from esbuild define
    if (typeof __TB_DEV_LOG__ !== 'undefined' && __TB_DEV_LOG__) {
      logFailure(friendlyName, variables.user_id, { networkError: err.message });
    }
    return {
      success: false,
      error: err.message || 'Network error',
    };
  }
}

/**
 * Dev-build failure log: the raw response Meta sends back when a block fails
 * (e.g. when it throttles), so the error classifier can learn its shape.
 * Every call site is guarded by __TB_DEV_LOG__ (esbuild.config.js), which is
 * false in the release build — esbuild then drops the calls and this function
 * with them, so none of it ships.
 */
function logFailure(friendlyName, userId, detail) {
  console.warn('[TB-dev] request failed', friendlyName, 'userId=', userId, detail);
}
