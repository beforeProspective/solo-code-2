<?php
function createZipFromDirectory($dir, $zipName) {
    $tempDir = sys_get_temp_dir();
    $zipFile = $tempDir . '/' . $zipName . '_' . time() . '.zip';
    
    $zip = new ZipArchive();
    if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new Exception('Cannot create zip file');
    }
    
    $dir = rtrim($dir, '/') . '/';
    $baseName = basename($dir);
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir),
        RecursiveIteratorIterator::SELF_FIRST
    );
    
    foreach ($files as $file) {
        if ($file->isDir()) continue;
        
        $filePath = $file->getRealPath();
        $relativePath = $baseName . '/' . substr($filePath, strlen($dir));
        
        $zip->addFile($filePath, $relativePath);
    }
    
    $zip->close();
    return $zipFile;
}

function createZipFromPaths($paths, $storage, $zipName) {
    $tempDir = sys_get_temp_dir();
    $zipFile = $tempDir . '/' . $zipName;
    
    $zip = new ZipArchive();
    if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new Exception('Cannot create zip file');
    }
    
    foreach ($paths as $path) {
        $fullPath = $storage->getFullPath($path);
        
        if (is_dir($fullPath)) {
            addDirectoryToZip($zip, $fullPath, $path);
        } else {
            $zip->addFile($fullPath, basename($path));
        }
    }
    
    $zip->close();
    return $zipFile;
}

function addDirectoryToZip($zip, $dir, $basePath) {
    $dir = rtrim($dir, '/') . '/';
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir),
        RecursiveIteratorIterator::SELF_FIRST
    );
    
    foreach ($files as $file) {
        if ($file->isDir()) continue;
        
        $filePath = $file->getRealPath();
        $relativePath = $basePath . '/' . substr($filePath, strlen($dir));
        
        $zip->addFile($filePath, $relativePath);
    }
}
