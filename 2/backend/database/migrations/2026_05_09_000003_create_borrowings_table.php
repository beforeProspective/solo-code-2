<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('borrowings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tool_id')->constrained('tools');
            $table->foreignId('borrower_id')->constrained('users');
            $table->dateTime('borrowed_at');
            $table->dateTime('due_date');
            $table->dateTime('returned_at')->nullable();
            $table->string('status')->default('borrowed');
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('borrowings');
    }
};
