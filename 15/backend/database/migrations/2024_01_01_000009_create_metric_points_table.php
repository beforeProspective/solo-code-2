<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('metric_points', function (Blueprint $table) {
            $table->id();
            $table->foreignId('metric_id')->constrained()->onDelete('cascade');
            $table->integer('value');
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('metric_points');
    }
};
