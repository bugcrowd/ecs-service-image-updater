'use strict'

const AWS = require('aws-sdk');
const _ = require('lodash');

// Set the default region to 'us-east-1' if not already set
if (!AWS.config.region) {
    AWS.config.update({
        region: process.env.AWS_DEFAULT_REGION || 'us-east-1'
    });
}

/**
 *
 * @param options
 * @param {int} options.interval
 * @param {boolean} options.verbose
 * @param {string} options.serviceName
 * @param {string} options.clusterArn
 * @param {string} options.taskDefinitionArn
 * @param {function} cb
 */
function waiter(options, cb) {
    /**
     * getServiceTaskDeployments
     *
     * Retrieve the active Task Definition Arn on a service
     * @param {object} options A hash of options used when initiating this deployment
     * @param {function} cb Callback
     */
    function getServiceTaskDeployments(options, cb) {
        const ecs = new AWS.ECS();

        const params = {
            cluster: options.clusterArn,
            services: [options.serviceName]
        };

        ecs.describeServices(params, (err, data) => {
            if (err) return cb(err);

            var service = _.find(data.services, (s) => s.serviceName === options.serviceName);
            if (!service) return cb(new Error(`Could not find service "${options.serviceName}"`));

            cb(null, service.deployments);
        });
    }

    function periodicCheck() {
        getServiceTaskDeployments(options, function (err, deployments) {
            if (err) {
                cb(err);
                return;
            }
            const isCurrent = deployments.filter(deployment => deployment.taskDefinition === options.taskDefinitionArn).length === 1;

            if (!isCurrent) {
                console.log(`Task definition "${options.taskDefinitionArn}" for service "${options.serviceName}" is no longer deploying`)
                return;
            }
            if (deployments.length === 1) {
                console.log(`Task definition "${options.taskDefinitionArn}" for service "${options.serviceName}" is deployed`)
                return;
            }

            if (options.verbose) {
                let output = '[';
                deployments.map(function (deployment) {
                    if (deployment.taskDefinition === options.taskDefinitionArn) {
                        output += 'X'.repeat(deployment.runningCount);
                        output += 'x'.repeat(deployment.pendingCount);
                    } else {
                        output += '.'.repeat(deployment.runningCount);
                    }
                })
                output += ']';
                console.log(output);
            }

            setTimeout(periodicCheck, options.interval * 1000);
        })
    }

    setTimeout(periodicCheck, 2 * 1000);

}

module.exports = waiter;
