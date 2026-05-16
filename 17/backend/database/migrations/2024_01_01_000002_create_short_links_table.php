<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('short_links', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('original_url');
            $table->string('short_code')->unique();
            $table->string('custom_domain')->nullable();
            $table->string('password')->nullable();
            $table->unsignedInteger('clicks')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->index('short_code');
            $table->index('user_id');
        });
    }

    public function down()
    {
        Schema::dropIfExists('short_links');
    }
};
