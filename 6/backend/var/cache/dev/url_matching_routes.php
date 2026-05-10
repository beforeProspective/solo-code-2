<?php

/**
 * This file has been auto-generated
 * by the Symfony Routing Component.
 */

return [
    false, // $matchHost
    [ // $staticRoutes
        '/api/lenses' => [
            [['_route' => 'api_lenses', '_controller' => 'App\\Controller\\LensController::index'], null, ['GET' => 0], null, false, false, null],
            [['_route' => 'api_lenses_create', '_controller' => 'App\\Controller\\LensController::create'], null, ['POST' => 0], null, false, false, null],
            [['_route' => 'lens_index', '_controller' => 'App\\Controller\\LensController::index'], null, ['GET' => 0], null, false, false, null],
            [['_route' => 'lens_create', '_controller' => 'App\\Controller\\LensController::create'], null, ['POST' => 0], null, false, false, null],
        ],
        '/api/adapters' => [
            [['_route' => 'api_adapters', '_controller' => 'App\\Controller\\AdapterController::index'], null, ['GET' => 0], null, false, false, null],
            [['_route' => 'api_adapters_create', '_controller' => 'App\\Controller\\AdapterController::create'], null, ['POST' => 0], null, false, false, null],
            [['_route' => 'adapter_index', '_controller' => 'App\\Controller\\AdapterController::index'], null, ['GET' => 0], null, false, false, null],
            [['_route' => 'adapter_create', '_controller' => 'App\\Controller\\AdapterController::create'], null, ['POST' => 0], null, false, false, null],
        ],
        '/api/sample-photos' => [
            [['_route' => 'api_sample_photos', '_controller' => 'App\\Controller\\SamplePhotoController::index'], null, ['GET' => 0], null, false, false, null],
            [['_route' => 'api_sample_photos_create', '_controller' => 'App\\Controller\\SamplePhotoController::create'], null, ['POST' => 0], null, false, false, null],
            [['_route' => 'sample_photo_index', '_controller' => 'App\\Controller\\SamplePhotoController::index'], null, ['GET' => 0], null, false, false, null],
            [['_route' => 'sample_photo_create', '_controller' => 'App\\Controller\\SamplePhotoController::create'], null, ['POST' => 0], null, false, false, null],
        ],
        '/api/maintenance-records' => [
            [['_route' => 'api_maintenance_records', '_controller' => 'App\\Controller\\MaintenanceRecordController::index'], null, ['GET' => 0], null, false, false, null],
            [['_route' => 'api_maintenance_records_create', '_controller' => 'App\\Controller\\MaintenanceRecordController::create'], null, ['POST' => 0], null, false, false, null],
            [['_route' => 'maintenance_index', '_controller' => 'App\\Controller\\MaintenanceRecordController::index'], null, ['GET' => 0], null, false, false, null],
            [['_route' => 'maintenance_create', '_controller' => 'App\\Controller\\MaintenanceRecordController::create'], null, ['POST' => 0], null, false, false, null],
        ],
    ],
    [ // $regexpList
        0 => '{^(?'
                .'|/api/(?'
                    .'|lenses/([^/]++)(?'
                        .'|(*:33)'
                    .')'
                    .'|adapters/(?'
                        .'|([^/]++)(?'
                            .'|(*:64)'
                        .')'
                        .'|compatible(*:82)'
                        .'|([^/]++)(*:97)'
                        .'|compatible(*:114)'
                        .'|([^/]++)(?'
                            .'|(*:133)'
                        .')'
                    .')'
                    .'|sample\\-photos/([^/]++)(?'
                        .'|(*:169)'
                    .')'
                    .'|maintenance\\-records/(?'
                        .'|([^/]++)(?'
                            .'|(*:213)'
                        .')'
                        .'|overdue(?'
                            .'|(*:232)'
                        .')'
                        .'|reminders(?'
                            .'|(*:253)'
                        .')'
                        .'|([^/]++)(?'
                            .'|(*:273)'
                        .')'
                    .')'
                .')'
            .')/?$}sDu',
    ],
    [ // $dynamicRoutes
        33 => [
            [['_route' => 'api_lenses_show', '_controller' => 'App\\Controller\\LensController::show'], ['id'], ['GET' => 0], null, false, true, null],
            [['_route' => 'api_lenses_update', '_controller' => 'App\\Controller\\LensController::update'], ['id'], ['PUT' => 0], null, false, true, null],
            [['_route' => 'api_lenses_delete', '_controller' => 'App\\Controller\\LensController::delete'], ['id'], ['DELETE' => 0], null, false, true, null],
            [['_route' => 'lens_show', '_controller' => 'App\\Controller\\LensController::show'], ['id'], ['GET' => 0], null, false, true, null],
            [['_route' => 'lens_update', '_controller' => 'App\\Controller\\LensController::update'], ['id'], ['PUT' => 0, 'PATCH' => 1], null, false, true, null],
            [['_route' => 'lens_delete', '_controller' => 'App\\Controller\\LensController::delete'], ['id'], ['DELETE' => 0], null, false, true, null],
        ],
        64 => [
            [['_route' => 'api_adapters_show', '_controller' => 'App\\Controller\\AdapterController::show'], ['id'], ['GET' => 0], null, false, true, null],
            [['_route' => 'api_adapters_update', '_controller' => 'App\\Controller\\AdapterController::update'], ['id'], ['PUT' => 0], null, false, true, null],
            [['_route' => 'api_adapters_delete', '_controller' => 'App\\Controller\\AdapterController::delete'], ['id'], ['DELETE' => 0], null, false, true, null],
        ],
        82 => [[['_route' => 'api_adapters_compatible', '_controller' => 'App\\Controller\\AdapterController::findCompatible'], [], ['GET' => 0], null, false, false, null]],
        97 => [[['_route' => 'adapter_show', '_controller' => 'App\\Controller\\AdapterController::show'], ['id'], ['GET' => 0], null, false, true, null]],
        114 => [[['_route' => 'adapter_compatible', '_controller' => 'App\\Controller\\AdapterController::findCompatible'], [], ['GET' => 0], null, false, false, null]],
        133 => [
            [['_route' => 'adapter_update', '_controller' => 'App\\Controller\\AdapterController::update'], ['id'], ['PUT' => 0, 'PATCH' => 1], null, false, true, null],
            [['_route' => 'adapter_delete', '_controller' => 'App\\Controller\\AdapterController::delete'], ['id'], ['DELETE' => 0], null, false, true, null],
        ],
        169 => [
            [['_route' => 'api_sample_photos_show', '_controller' => 'App\\Controller\\SamplePhotoController::show'], ['id'], ['GET' => 0], null, false, true, null],
            [['_route' => 'api_sample_photos_update', '_controller' => 'App\\Controller\\SamplePhotoController::update'], ['id'], ['PUT' => 0], null, false, true, null],
            [['_route' => 'api_sample_photos_delete', '_controller' => 'App\\Controller\\SamplePhotoController::delete'], ['id'], ['DELETE' => 0], null, false, true, null],
            [['_route' => 'sample_photo_show', '_controller' => 'App\\Controller\\SamplePhotoController::show'], ['id'], ['GET' => 0], null, false, true, null],
            [['_route' => 'sample_photo_update', '_controller' => 'App\\Controller\\SamplePhotoController::update'], ['id'], ['PUT' => 0, 'PATCH' => 1], null, false, true, null],
            [['_route' => 'sample_photo_delete', '_controller' => 'App\\Controller\\SamplePhotoController::delete'], ['id'], ['DELETE' => 0], null, false, true, null],
        ],
        213 => [
            [['_route' => 'api_maintenance_records_show', '_controller' => 'App\\Controller\\MaintenanceRecordController::show'], ['id'], ['GET' => 0], null, false, true, null],
            [['_route' => 'api_maintenance_records_update', '_controller' => 'App\\Controller\\MaintenanceRecordController::update'], ['id'], ['PUT' => 0], null, false, true, null],
            [['_route' => 'api_maintenance_records_delete', '_controller' => 'App\\Controller\\MaintenanceRecordController::delete'], ['id'], ['DELETE' => 0], null, false, true, null],
        ],
        232 => [
            [['_route' => 'api_maintenance_records_overdue', '_controller' => 'App\\Controller\\MaintenanceRecordController::getOverdue'], [], ['GET' => 0], null, false, false, null],
            [['_route' => 'maintenance_overdue', '_controller' => 'App\\Controller\\MaintenanceRecordController::getOverdue'], [], ['GET' => 0], null, false, false, null],
        ],
        253 => [
            [['_route' => 'api_maintenance_records_reminders', '_controller' => 'App\\Controller\\MaintenanceRecordController::getReminders'], [], ['GET' => 0], null, false, false, null],
            [['_route' => 'maintenance_reminders', '_controller' => 'App\\Controller\\MaintenanceRecordController::getReminders'], [], ['GET' => 0], null, false, false, null],
        ],
        273 => [
            [['_route' => 'maintenance_show', '_controller' => 'App\\Controller\\MaintenanceRecordController::show'], ['id'], ['GET' => 0], null, false, true, null],
            [['_route' => 'maintenance_update', '_controller' => 'App\\Controller\\MaintenanceRecordController::update'], ['id'], ['PUT' => 0, 'PATCH' => 1], null, false, true, null],
            [['_route' => 'maintenance_delete', '_controller' => 'App\\Controller\\MaintenanceRecordController::delete'], ['id'], ['DELETE' => 0], null, false, true, null],
            [null, null, null, null, false, false, 0],
        ],
    ],
    null, // $checkCondition
];
