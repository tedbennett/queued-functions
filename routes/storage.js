const router = require('express').Router();
const aws = require('aws-sdk');
const crypto = require('crypto');

aws.config.region = 'eu-west-1';

require('dotenv').config();

const getRandomFilename = () => crypto.randomBytes(16).toString('hex');

router.get('/sign-s3', (req, res) => {
  const s3 = new aws.S3();
  const fileName = getRandomFilename();
  const fileType = req.query['file-type'];
  const s3Params = {
    Bucket: process.env.S3_BUCKET,
    Key: fileName,
    Expires: 60,
    ContentType: fileType,
    ACL: 'public-read',
  };

  s3.getSignedUrl('putObject', s3Params, (err, data, next) => {
    if (err) {
      console.log(err);
      next(err);
    }
    const returnData = {
      signedRequest: data,
      url: `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${fileName}`,
    };
    res.json(returnData);
    res.end();
  });
});

module.exports = router;
