const {
  lambda: { log },
} = require('alonzo');

exports.handler = async () => {
  const logContext = {};

  log.info('get-facebook-integration was called', { ...logContext });

  return {
    status: 200,
    body: {
      message: 'API get-facebook-integration called successfully',
    },
  };
};
