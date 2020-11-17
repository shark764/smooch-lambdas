const axios = require('axios');

jest.mock('axios');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  smooch_api_url: 'mock-amooch-api-url',
};

const event = {
  params: {
    'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
    'interaction-id': '66d83870-30df-4a3b-8801-59edff162040',
  },
  body: {
    message: '',
    agentMessageId: '66d83870-30df-4a3b-8801-59edff162045',
  },
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
    'first-name': 'first-name',
    'last-name': 'last-name',
  },
};

const mockGetSecretValue = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        '5e31c81640a22c000f5d7c55-id': 'id',
        '5e31c81640a22c000f5d7c55-secert': 'secret',
      }),
    }),
  }));

axios.mockImplementation(() => ({
  data: {
    smoochIntegrationId: '66d83870-30df-4a3b-8801-59edff162055',
    latestMessageSentBy: 'customer',
    appId: '5e31c81640a22c000f5d7c55',
    userId: '5e31c81640a22c000f5d7c75',
    method: 'get',
    url: 'https://us-east-1-dev-edge.domain/v1/tenants/66d83870-30df-4a3b-8801-59edff162034/interactions/66d83870-30df-4a3b-8801-59edff162040/metadata',
  },
}));

const mockSendMessage = jest.fn()
  .mockImplementation(() => ({
    message: {
      _id: '5e31c81640a22c000f5d7c80',
      text: 'text',
      received: 50,
    },
  }));

const mockGet = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      Item: {
        'client-disconnect-minutes': 50,
        LatestCustomerMessageTimestamp: '2020-02-18T20:47:58.670Z',
        LatestAgentMessageTimestamp: '2020-02-18T20:47:40.670Z',
      },
    }),
  }));

const mockGetQueueUrl = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      QueueUrl: 'queue-url',
    }),
  }));

const mockSqsSendMessage = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockSmoochCore = jest.fn(() => ({
  appUsers: { sendMessage: mockSendMessage },
}));

jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
  })),
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: mockGetQueueUrl,
    sendMessage: mockSqsSendMessage,
  })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      get: mockGet,
    })),
  },
}));

jest.mock('smooch-core', () => mockSmoochCore);

const { handler } = require('../index');

describe('send-message', () => {
  describe('Everthing is successful', () => {
    it('sends back status 200 when the code runs without any error', async () => {
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it('when there is a error sending reporting event', async () => {
      mockGetQueueUrl.mockImplementationOnce(() => ({
        promise: () => ({
          OueueUrl: 'queue-url',
        }),
      }));
      mockGetQueueUrl.mockImplementationOnce(() => ({
        promise: () => ({
          OueueUrl: 'queue-url',
        }),
      }));
      mockGetQueueUrl.mockRejectedValueOnce(new Error());
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it('when there is a error checking for dead interaction', async () => {
      const error = new Error();
      error.response = {
        status: 0,
      };
      axios.mockImplementationOnce(() => ({
        data: {
          method: 'get',
          latestMessageSentBy: 'agent',
          url: 'https://us-east-1-dev-edge.domain/v1/tenants/66d83870-30df-4a3b-8801-59edff162034/interactions/66d83870-30df-4a3b-8801-59edff162040/metadata',
          smoochIntegrationId: '66d83870-30df-4a3b-8801-59edff162050',
          appId: '5e31c81640a22c000f5d7f28',
          userId: '5e31c81640a22c000f5d7f30',
          artifactId: '5e31c81640a22c000f5d7f35',
        },
      }));
      axios.mockRejectedValueOnce(error);
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it('when time stamps are not provided', async () => {
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            'client-disconnect-minutes': 50,
          },
        }),
      }));
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
          },
        }),
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it('when customer message timestamp or agent message timestamp are not provided', async () => {
      mockGet.mockImplementation(() => ({
        promise: () => ({
          Item: {
            'client-disconnect-minutes': 50,
          },
        }),
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it('when customer message timestamp is greater than agent message timestamp', async () => {
      mockGet.mockImplementation(() => ({
        promise: () => ({
          Item: {
            'client-disconnect-minutes': 50,
            LatestCustomerMessageTimestamp: '2020-02-18T20:47:58.670Z',
            LatestAgentMessageTimestamp: '2020-02-18T20:47:40.670Z',
          },
        }),
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it('when customer message timestamp is less than agent message timestamp', async () => {
      mockGet.mockImplementation(() => ({
        promise: () => ({
          Item: {
            'client-disconnect-minutes': 50,
            LatestCustomerMessageTimestamp: '2020-02-18T20:47:28.670Z',
            LatestAgentMessageTimestamp: '2020-02-18T20:47:40.670Z',
          },
        }),
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it('When client disconnect minutes are not provided', async () => {
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            'client-disconnect-minutes': '',
          },
        }),
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it('When no register in table is found for client disconnect minutes checker', async () => {
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: null,
        }),
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    describe('Walkthrough', () => {
      beforeEach(async () => {
        await handler(event);
      });
      it('passes in the correct arguments to secretClient.getSecretValue() to retrieve digital channles credentials', async () => {
        expect(mockGetSecretValue.mock.calls[0]).toEqual(expect.arrayContaining([{
          SecretId: 'us-east-1-dev-smooch-app',
        }]));
      });

      it('passes in the correct arguments to secretClient.getSecretValue() to retrieve cx credentials', async () => {
        expect(mockGetSecretValue.mock.calls[1]).toEqual(expect.arrayContaining([{
          SecretId: 'us-east-1-dev-smooch-cx',
        }]));
      });

      it('passes in the correct arguments to axios to get interaction metadata', async () => {
        expect(axios.mock.calls[0][0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to SmoochCore', async () => {
        expect(mockSmoochCore.mock.calls[0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.appUsers.sendMessage()', async () => {
        expect(mockSendMessage.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to docClient.get() in getClientInactivityTimeout()', async () => {
        expect(mockGet.mock.calls[0]).toEqual(expect.arrayContaining([{
          TableName: 'us-east-1-dev-smooch',
          Key: {
            'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            id: '66d83870-30df-4a3b-8801-59edff162055',
          },
        }]));
      });

      it('passes in the correct arguments to docClient.get() in shouldCheckIfClientIsDisconnected()', async () => {
        expect(mockGet.mock.calls[1]).toEqual(expect.arrayContaining([{
          TableName: 'us-east-1-dev-smooch-interactions',
          Key: {
            SmoochUserId: '5e31c81640a22c000f5d7c75',
          },
        }]));
      });

      it('passes in the correct arguments to sqs.getQueueUrl() in checkIfClientIsDisconnected()', async () => {
        expect(mockGetQueueUrl.mock.calls[0]).toEqual(expect.arrayContaining([{
          QueueName: 'us-east-1-dev-smooch-client-disconnect-checker',
        }]));
      });

      it('passes in the correct arguments to sqs.sendMessages() in checkIfClientIsDisconnected()', async () => {
        expect(mockSqsSendMessage.mock.calls[0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to sqs.getQueueUrl() in sendReportingEvent()', async () => {
        expect(mockGetQueueUrl.mock.calls[2]).toEqual(expect.arrayContaining([{
          QueueName: 'us-east-1-dev-send-reporting-event',
        }]));
      });

      it('passes in the correct arguments to sqs.sendMessages() in sendReportingEvent()', async () => {
        expect(mockSqsSendMessage.mock.calls[1]).toMatchSnapshot();
      });
    });
  });
  it('sends back status 500 when there is a error retrieving digital channels credentials', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error retrieving cx credentials', async () => {
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({
        SecretString: JSON.stringify({
          '5e31c81640a22c000f5d7c55-id': 'id',
          '5e31c81640a22c000f5d7c55-secert': 'secret',
        }),
      }),
    }));
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error retrieving the interaction metadata', async () => {
    axios.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error retrieving digital channels credentials (thrown by SmoochCore)', async () => {
    mockSmoochCore.mockImplementationOnce(() => {
      throw new Error('SmoochCore');
    });
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error sending message', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });


  it('sends back status 410 when sending message to dead interaction', async () => {
    const error = new Error();
    error.response = {
      status: 404,
    };
    axios.mockImplementationOnce(() => ({
      data: {
        method: 'get',
        url: 'https://us-east-1-dev-edge.domain/v1/tenants/66d83870-30df-4a3b-8801-59edff162034/interactions/66d83870-30df-4a3b-8801-59edff162040/metadata',
        smoochIntegrationId: '66d83870-30df-4a3b-8801-59edff162050',
        appId: '5e31c81640a22c000f5d7f28',
        userId: '5e31c81640a22c000f5d7f30',
      },
    }));
    axios.mockRejectedValueOnce(error);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('throws an error when there is an error updating latestMessageSentBy flag from metadata', async () => {
    try {
      mockGet.mockImplementation(() => ({
        promise: () => ({
          Item: {
            'client-disconnect-minutes': 50,
            LatestCustomerMessageTimestamp: '2020-02-18T20:47:58.670Z',
            LatestAgentMessageTimestamp: '2020-02-18T20:47:40.670Z',
          },
        }),
      }));
      mockGetQueueUrl.mockImplementationOnce(() => ({
        promise: () => ({
          OueueUrl: 'queue-url',
        }),
      }));
      mockGetQueueUrl.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error updating latestMessageSentBy flag from metadata'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is an error getting smooch interaction record (thrown by getClientInactivityTimeout())', async () => {
    try {
      mockGet.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Failed to get smooch interaction record'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is an error getting smooch interaction record (thrown by shouldCheckIfClientIsDisconnected())', async () => {
    try {
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            'client-disconnect-minutes': 50,
          },
        }),
      }));
      mockGet.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Failed to get smooch interaction record'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
