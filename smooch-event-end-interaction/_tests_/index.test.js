const event = {
  Records: [{
    body: JSON.stringify({
      'tenant-id': '250faddb-9723-403a-9bd5-3ca710cb26e5',
      'interaction-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      event: 'event',
      'interaction-metadata': {
        'app-id': '5e31c81640a22c000f5d7f28',
        'user-id': '5e31c81640a22c000f5d7f67',
      },
    }),
  }],
};

const { handler } = require('../index');

describe('smooch-event-end-interaction', () => {
  describe('Everything is successful', () => {
    it('when the code runs without any error', async () => {
      await handler(event);
    });
  });
});
