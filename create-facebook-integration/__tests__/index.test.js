const event = {};

const { handler } = require('../index');

describe('create-facebook-integration', () => {
  describe('Everything is successful', () => {
    it('returns when the code runs without any error', async () => {
      const result = handler(event);
      expect(result).toBeTruthy();
    });
  });
});