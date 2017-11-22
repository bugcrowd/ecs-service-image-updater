ECS Service Image Updater
=========================

ECS Service Image Updater assists with updating an ECS Service to use a new Docker image. If all you are changing is the image (eg new version of your application) it can be cumbersome to create a new Task Definition. It will copy the current running Task Definition in the Service, update the image, publish the new Task Definition and update the Service to use the new Task Definition.

CLI Usage
---------

```
Options:
  --help            Show help                                          [boolean]
  --version         Show version number                                [boolean]
  --cluster-arn                                                       [required]
  --service-name                                                      [required]
  --image                                                             [required]
  --container-name                                                    [required]
```

Module Usage
------------

```js
const updater = require('ecs-service-image-updater');

var options = {
  clusterArn: 'clusterArn',
  serviceName: 'serviceName',
  containerName: 'containerName',
  image: 'image:tag'
}

updater(options, (err, taskDefinitionArn) => {
  if (err) throw err;
  console.log('done');
});
```
