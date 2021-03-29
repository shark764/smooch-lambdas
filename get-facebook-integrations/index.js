const {
  lambda: { log },
} = require('alonzo');

exports.handler = async () => {
  const logContext = {};

  log.info('get-facebook-integrations was called', { ...logContext });

  return {
    status: 200,
    body: {
      message: 'API get-facebook-integrations called successfully',
    },
  };
};
