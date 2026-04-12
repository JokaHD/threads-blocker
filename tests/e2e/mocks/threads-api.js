export const mockResponses = {
  blockSuccess: {
    data: {
      user_block: {
        user: { id: '12345' },
        success: true,
      },
    },
  },

  blockRateLimit: {
    errors: [
      {
        message: 'Rate limited',
        severity: 'ERROR',
        code: 1545012,
      },
    ],
  },

  unblockSuccess: {
    data: {
      user_unblock: {
        user: { id: '12345' },
        success: true,
      },
    },
  },

  networkError: null,
};

export async function setupApiMocks(page, scenario = 'blockSuccess') {
  await page.route('**/api/graphql', async (route) => {
    const response = mockResponses[scenario];

    if (response === null) {
      await route.abort('failed');
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

export async function injectFakeTokens(context) {
  await context.addCookies([
    {
      name: 'csrftoken',
      value: 'test-csrf-token',
      domain: '.threads.com',
      path: '/',
    },
  ]);
}

export async function injectFakeScripts(page) {
  await page.addInitScript(() => {
    // TokenProvider looks for these specific patterns in script textContent:
    // - "DTSGInitialData",[],{"token":"..."}
    // - "LSD",[],{"token":"..."}
    const script = document.createElement('script');
    // The pattern matching looks for literal strings, so embed them directly
    script.textContent = '"DTSGInitialData",[],{"token":"test-dtsg-token"} "LSD",[],{"token":"test-lsd-token"}';
    script.setAttribute('data-testid', 'fake-tokens');
    document.head.appendChild(script);
  });
}
