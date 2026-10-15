package custom

import (
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

// ComputeDerived rewrites stats through the Stats struct, so a key the struct does not declare is
// dropped on the first save. Tables has no derived values — this only pins that it survives.
func TestComputeDerived_KeepsTables(t *testing.T) {
	p := New()
	in := Stats{Tables: map[string][]TableRow{
		"inv": {{ID: "r_1", Cells: map[string]string{"name": "Lina", "desc": "10 m"}}},
	}}
	raw, _ := bson.Marshal(in)

	out, err := p.ComputeDerived(raw)
	if err != nil {
		t.Fatalf("ComputeDerived() error: %v", err)
	}
	got, _ := decodeStats(out)
	if !reflect.DeepEqual(got.Tables, in.Tables) {
		t.Errorf("Tables = %+v, want %+v", got.Tables, in.Tables)
	}
}

func TestDecodeStats_InitialisesTables(t *testing.T) {
	raw, _ := bson.Marshal(Stats{})
	s, err := decodeStats(raw)
	if err != nil {
		t.Fatalf("decodeStats() error: %v", err)
	}
	if s.Tables == nil {
		t.Error("Tables = nil, want an empty map")
	}
}
