const event = {
  Records: [{
    body: JSON.stringify({
      tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
      interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
      smoochAppId: '667802d8-2260-436c-958a-2ee0f71f73f1',
      smoochUserId: '667802d8-2260-436c-958a-2ee0f71f73f2',
      smoochMessageId: '667802d8-2260-436c-958a-2ee0f71f73f3',
    }),
  }],
};

const mockGetSecretValue = jest.fn(() => {})
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        '667802d8-2260-436c-958a-2ee0f71f73f1-id': 'id',
        '667802d8-2260-436c-958a-2ee0f71f73f1-secret': 'secret',
      }),
    }),
  }));

const mockGetMessages = jest.fn(() => ({}))
  .mockImplementation(() => ({
    messages: [{
      _id: '667802d8-2260-436c-958a-2ee0f71f73f3',
      mediaUrl: 'media-url',
    }],
  }));

const mockDelete = jest.fn(() => ({}))
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockSmoochCore = jest.fn(() => ({
  appUsers: {
    getMessages: mockGetMessages,
  },
  attachments: {
    delete: mockDelete,
  },
}));

jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn().mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
}));

jest.mock('smooch-core', () => mockSmoochCore);

const { handler } = require('../index');

describe('delete-smooch-attachments', () => {
  describe('Everything is successful', () => {
    describe('File not found', () => {
      it('attachments file not found', async () => {
        mockGetMessages.mockImplementationOnce(() => ({
          messages: [{}],
        }));
        await handler(event);
        expect(mockDelete).not.toHaveBeenCalled();
      });
    });
    describe('File is found', () => {
      beforeAll(async () => {
        await handler(event);
      });
      it('passes in the correct arguments to secretClient.getSecretValue()', async () => {
        expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to SmoochCore', async () => {
        expect(mockSmoochCore.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.appUsers.getMessages', async () => {
        expect(mockGetMessages.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.attachments.delete', async () => {
        expect(mockDelete.mock.calls).toMatchSnapshot();
      });
    });
  });
  it('throws an error when there is a problem retrieving digital channels credentials', async () => {
    try {
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (errro) {
      expect(Promise.reject(new Error('Error retrieving digital channels credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving digital channels credentials (SmoochCore)', async () => {
    try {
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({}),
      }));
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving digital channels credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is problem fetching interaction messages', async () => {
    try {
      mockGetMessages.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error fetching interaction messages'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is problem deleting smooch attachment', async () => {
    try {
      mockDelete.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error trying to delete smooch attachment'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving digital channels credentials (thrown by SmoochCore)', async () => {
    try {
      mockSmoochCore.mockImplementationOnce(() => {
        throw new Error('SmoochCore');
      });
      await handler(event);
    } catch (error) {
      expect(new Error('Error retrieving digital channels')).toThrowErrorMatchingSnapshot();
    }
  });
});
