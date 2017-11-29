ECS Service Image Updater
=========================

ECS Service Image Updater assists with updating an ECS Service to use a new Docker image. If all you are changing is the image (eg new version of your application) it can be cumbersome to create a new Task Definition. It will copy the current running Task Definition in the Service, update the image, publish the new Task Definition and update the Service to use the new Task Definition.

CLI Usage
---------

```
Options:
  --help                    Show help                                  [boolean]
  --version                 Show version number                        [boolean]
  --image                   Docker image and tag                      [required]
  --container-name          Container to update in the ECS Task Definition
                                                                      [required]
  --service-name            ECS Service to update
  --task-definition-family  Task Definition Family create the new Task
                            Definition in
  --cluster-arn             Arn of the ECS Cluster for which the Service exists
                            on. Used in conjunction with service-name
  --output-arn-only         Output the new Task Definition Arn only
```

### Examples

#### Update an ECS Service to use a new image
`$ ecs-service-image-updater --cluster-arn arn:aws:ecs:us-east-1:123456789:cluster/cluster --image image:tag --container-name app --service-name app`

#### Create new Task Definition from latest Task Definition in a Task Definition Family
`$ ecs-service-image-updater --image image:tag --container-name app --task-definition-family app`

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
