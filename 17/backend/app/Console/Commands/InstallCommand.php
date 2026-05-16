<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class InstallCommand extends Command
{
    protected $signature = 'app:install';
    protected $description = 'Install the application';

    public function handle()
    {
        $this->info('Running migrations...');
        $this->call('migrate', ['--force' => true]);

        $this->info('Seeding database...');
        $this->call('db:seed', ['--force' => true]);

        $this->info('Installation completed!');
        $this->info('Default admin account: admin@example.com / admin123');
        $this->info('Default user account: user@example.com / user123');
    }
}
