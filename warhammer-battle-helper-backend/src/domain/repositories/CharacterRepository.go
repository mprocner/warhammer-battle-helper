package repositories

import (
	"battle-helper/domain/models"
	"database/sql"
)

type CharacterRepository struct {
	DB *sql.DB
}

func (r *CharacterRepository) Upsert(c models.Character) error {
	_, err := r.DB.Exec(`
    INSERT INTO characters (id,name,type,avatar,data)
    VALUES (?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        type=excluded.type,
        avatar=excluded.avatar,
        data=excluded.data,
        updated_at=CURRENT_TIMESTAMP
    `, c.ID, c.Name, c.Type, c.Avatar, c.Data)
	return err
}

func (r *CharacterRepository) GetAll() ([]models.Character, error) {
	rows, err := r.DB.Query(`SELECT id,name,type,avatar,data,created_at,updated_at FROM characters ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []models.Character
	for rows.Next() {
		var c models.Character
		if err := rows.Scan(&c.ID, &c.Name, &c.Type, &c.Avatar, &c.Data, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}
