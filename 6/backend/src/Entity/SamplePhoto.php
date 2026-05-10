<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class SamplePhoto
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'samplePhotos')]
    #[ORM\JoinColumn(nullable: false)]
    private ?Lens $lens = null;

    #[ORM\Column(length: 255)]
    private ?string $title = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(length: 500)]
    private ?string $imageUrl = null;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 1, nullable: true)]
    private ?float $apertureUsed = null;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 2, nullable: true)]
    private ?float $shutterSpeed = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $isoUsed = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $cameraModel = null;

    #[ORM\Column(type: 'datetime', nullable: true)]
    private ?\DateTimeInterface $dateTaken = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(type: 'datetime')]
    private ?\DateTimeInterface $createdAt = null;

    #[ORM\Column(type: 'datetime')]
    private ?\DateTimeInterface $updatedAt = null;

    public function __construct()
    {
        $this->createdAt = new \DateTime();
        $this->updatedAt = new \DateTime();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getLens(): ?Lens
    {
        return $this->lens;
    }

    public function setLens(?Lens $lens): self
    {
        $this->lens = $lens;
        return $this;
    }

    public function getTitle(): ?string
    {
        return $this->title;
    }

    public function setTitle(string $title): self
    {
        $this->title = $title;
        return $this;
    }

    public function getDescription(): ?string
    {
        return $this->description;
    }

    public function setDescription(?string $description): self
    {
        $this->description = $description;
        return $this;
    }

    public function getImageUrl(): ?string
    {
        return $this->imageUrl;
    }

    public function setImageUrl(string $imageUrl): self
    {
        $this->imageUrl = $imageUrl;
        return $this;
    }

    public function getApertureUsed(): ?float
    {
        return $this->apertureUsed;
    }

    public function setApertureUsed(?float $apertureUsed): self
    {
        $this->apertureUsed = $apertureUsed;
        return $this;
    }

    public function getShutterSpeed(): ?float
    {
        return $this->shutterSpeed;
    }

    public function setShutterSpeed(?float $shutterSpeed): self
    {
        $this->shutterSpeed = $shutterSpeed;
        return $this;
    }

    public function getIsoUsed(): ?int
    {
        return $this->isoUsed;
    }

    public function setIsoUsed(?int $isoUsed): self
    {
        $this->isoUsed = $isoUsed;
        return $this;
    }

    public function getCameraModel(): ?string
    {
        return $this->cameraModel;
    }

    public function setCameraModel(?string $cameraModel): self
    {
        $this->cameraModel = $cameraModel;
        return $this;
    }

    public function getDateTaken(): ?\DateTimeInterface
    {
        return $this->dateTaken;
    }

    public function setDateTaken(?\DateTimeInterface $dateTaken): self
    {
        $this->dateTaken = $dateTaken;
        return $this;
    }

    public function getNotes(): ?string
    {
        return $this->notes;
    }

    public function setNotes(?string $notes): self
    {
        $this->notes = $notes;
        return $this;
    }

    public function getCreatedAt(): ?\DateTimeInterface
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeInterface $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }

    public function getUpdatedAt(): ?\DateTimeInterface
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(\DateTimeInterface $updatedAt): self
    {
        $this->updatedAt = $updatedAt;
        return $this;
    }
}
