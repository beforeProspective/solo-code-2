<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('clicks', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('short_link_id');
            $table->string('ip_address')->nullable();
            $table->string('user_agent')->nullable();
            $table->string('referer')->nullable();
            $table->string('country')->nullable();
            $table->string('city')->nullable();
            $table->timestamps();
            
            $table->foreign('short_link_id')->references('id')->on('short_links')->onDelete('cascade');
            $table->index('short_link_id');
            $table->index('created_at');
        });
    }

    public function down()
    {
        Schema::dropIfExists('clicks');
    }
};
