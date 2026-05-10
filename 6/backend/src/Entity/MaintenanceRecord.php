<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class MaintenanceRecord
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'maintenanceRecords')]
    #[ORM\JoinColumn(nullable: false)]
    private ?Lens $lens = null;

    #[ORM\Column(type: 'datetime')]
    private ?\DateTimeInterface $checkDate = null;

    #[ORM\Column(length: 100)]
    private ?string $checkType = null;

    #[ORM\Column(type: 'boolean')]
    private bool $hasMold = false;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $moldLocation = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $moldSeverity = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $actionsTaken = null;

    #[ORM\Column(type: 'datetime', nullable: true)]
    private ?\DateTimeInterface $nextCheckDate = null;

    #[ORM\Column(type: 'datetime')]
    private ?\DateTimeInterface $createdAt = null;

    #[ORM\Column(type: 'datetime')]
    private ?\DateTimeInterface $updatedAt = null;

    public function __construct()
    {
        $this->createdAt = new \DateTime();
        $this->updatedAt = new \DateTime();
        $this->checkDate = new \DateTime();
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

    public function getCheckDate(): ?\DateTimeInterface
    {
        return $this->checkDate;
    }

    public function setCheckDate(\DateTimeInterface $checkDate): self
    {
        $this->checkDate = $checkDate;
        return $this;
    }

    public function getCheckType(): ?string
    {
        return $this->checkType;
    }

    public function setCheckType(string $checkType): self
    {
        $this->checkType = $checkType;
        return $this;
    }

    public function isHasMold(): bool
    {
        return $this->hasMold;
    }

    public function setHasMold(bool $hasMold): self
    {
        $this->hasMold = $hasMold;
        return $this;
    }

    public function getMoldLocation(): ?string
    {
        return $this->moldLocation;
    }

    public function setMoldLocation(?string $moldLocation): self
    {
        $this->moldLocation = $moldLocation;
        return $this;
    }

    public function getMoldSeverity(): ?string
    {
        return $this->moldSeverity;
    }

    public function setMoldSeverity(?string $moldSeverity): self
    {
        $this->moldSeverity = $moldSeverity;
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

    public function getActionsTaken(): ?string
    {
        return $this->actionsTaken;
    }

    public function setActionsTaken(?string $actionsTaken): self
    {
        $this->actionsTaken = $actionsTaken;
        return $this;
    }

    public function getNextCheckDate(): ?\DateTimeInterface
    {
        return $this->nextCheckDate;
    }

    public function setNextCheckDate(?\DateTimeInterface $nextCheckDate): self
    {
        $this->nextCheckDate = $nextCheckDate;
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
