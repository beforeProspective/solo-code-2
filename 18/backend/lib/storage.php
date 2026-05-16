<?php
interface StorageAdapter {
    public function upload($source, $destination);
    public function download($path);
    public function delete($path);
    public function exists($path);
    public function getSize($path);
    public function listFiles($directory);
    public function createDirectory($path);
    public function copy($source, $destination);
    public function move($source, $destination);
    public function getFullPath($relativePath);
}

class LocalStorage implements StorageAdapter {
    private $baseDir;
    
    public function __construct($baseDir) {
        $this->baseDir = rtrim($baseDir, '/') . '/';
    }
    
    public function upload($source, $destination) {
        $fullPath = $this->getFullPath($destination);
        $this->ensureDirectoryExists(dirname($fullPath));
        return move_uploaded_file($source, $fullPath);
    }
    
    public function download($path) {
        $fullPath = $this->getFullPath($path);
        if (!file_exists($fullPath)) {
            return false;
        }
        return file_get_contents($fullPath);
    }
    
    public function delete($path) {
        $fullPath = $this->getFullPath($path);
        if (is_dir($fullPath)) {
            return $this->deleteDirectory($fullPath);
        }
        return file_exists($fullPath) ? unlink($fullPath) : true;
    }
    
    public function exists($path) {
        return file_exists($this->getFullPath($path));
    }
    
    public function getSize($path) {
        $fullPath = $this->getFullPath($path);
        return file_exists($fullPath) ? filesize($fullPath) : 0;
    }
    
    public function listFiles($directory) {
        $fullPath = $this->getFullPath($directory);
        if (!is_dir($fullPath)) return [];
        
        $items = [];
        $files = scandir($fullPath);
        foreach ($files as $file) {
            if ($file === '.' || $file === '..') continue;
            $filePath = $fullPath . '/' . $file;
            $relativePath = trim($directory . '/' . $file, '/');
            $items[] = [
                'name' => $file,
                'path' => $relativePath,
                'type' => is_dir($filePath) ? 'directory' : 'file',
                'size' => is_dir($filePath) ? 0 : filesize($filePath),
                'modified' => filemtime($filePath)
            ];
        }
        return $items;
    }
    
    public function createDirectory($path) {
        $fullPath = $this->getFullPath($path);
        return $this->ensureDirectoryExists($fullPath);
    }
    
    public function copy($source, $destination) {
        $src = $this->getFullPath($source);
        $dest = $this->getFullPath($destination);
        $this->ensureDirectoryExists(dirname($dest));
        
        if (is_dir($src)) {
            return $this->copyDirectory($src, $dest);
        }
        return copy($src, $dest);
    }
    
    public function move($source, $destination) {
        $src = $this->getFullPath($source);
        $dest = $this->getFullPath($destination);
        $this->ensureDirectoryExists(dirname($dest));
        return rename($src, $dest);
    }
    
    public function getFullPath($relativePath) {
        $relativePath = trim($relativePath, '/');
        return $this->baseDir . $relativePath;
    }
    
    private function ensureDirectoryExists($path) {
        if (!is_dir($path)) {
            return mkdir($path, 0777, true);
        }
        return true;
    }
    
    private function deleteDirectory($dir) {
        if (!is_dir($dir)) return false;
        $files = array_diff(scandir($dir), ['.', '..']);
        foreach ($files as $file) {
            is_dir("$dir/$file") ? $this->deleteDirectory("$dir/$file") : unlink("$dir/$file");
        }
        return rmdir($dir);
    }
    
    private function copyDirectory($src, $dest) {
        $this->ensureDirectoryExists($dest);
        $files = array_diff(scandir($src), ['.', '..']);
        foreach ($files as $file) {
            if (is_dir("$src/$file")) {
                $this->copyDirectory("$src/$file", "$dest/$file");
            } else {
                copy("$src/$file", "$dest/$file");
            }
        }
        return true;
    }
}

class S3Storage implements StorageAdapter {
    public function upload($source, $destination) {
        return false;
    }
    public function download($path) { return false; }
    public function delete($path) { return false; }
    public function exists($path) { return false; }
    public function getSize($path) { return 0; }
    public function listFiles($directory) { return []; }
    public function createDirectory($path) { return true; }
    public function copy($source, $destination) { return false; }
    public function move($source, $destination) { return false; }
    public function getFullPath($relativePath) { return $relativePath; }
}

class DropboxStorage implements StorageAdapter {
    public function upload($source, $destination) { return false; }
    public function download($path) { return false; }
    public function delete($path) { return false; }
    public function exists($path) { return false; }
    public function getSize($path) { return 0; }
    public function listFiles($directory) { return []; }
    public function createDirectory($path) { return true; }
    public function copy($source, $destination) { return false; }
    public function move($source, $destination) { return false; }
    public function getFullPath($relativePath) { return $relativePath; }
}

class FTPStorage implements StorageAdapter {
    public function upload($source, $destination) { return false; }
    public function download($path) { return false; }
    public function delete($path) { return false; }
    public function exists($path) { return false; }
    public function getSize($path) { return 0; }
    public function listFiles($directory) { return []; }
    public function createDirectory($path) { return true; }
    public function copy($source, $destination) { return false; }
    public function move($source, $destination) { return false; }
    public function getFullPath($relativePath) { return $relativePath; }
}

class StorageFactory {
    public static function create($adapter = 'local', $userId = 0) {
        $userDir = UPLOAD_DIR . 'user_' . $userId . '/';
        if (!is_dir($userDir)) {
            mkdir($userDir, 0777, true);
        }
        
        switch ($adapter) {
            case 's3':
                return new S3Storage();
            case 'dropbox':
                return new DropboxStorage();
            case 'ftp':
                return new FTPStorage();
            case 'local':
            default:
                return new LocalStorage($userDir);
        }
    }
}
