<?php

use Symfony\Component\Routing\Loader\Configurator\RoutingConfigurator;

return function (RoutingConfigurator $routes) {
    $routes->import([
        'path' => '../src/Controller/',
        'namespace' => 'App\Controller',
    ], 'attribute');
};
