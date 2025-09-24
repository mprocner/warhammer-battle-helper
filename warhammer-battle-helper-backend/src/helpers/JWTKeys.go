package helpers

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"io/ioutil"
	"log"
)

var PrivateKey *rsa.PrivateKey
var PublicKey *rsa.PublicKey

func LoadJWTKeys(privatePath, publicPath string) {
	privBytes, err := ioutil.ReadFile(privatePath)
	if err != nil {
		log.Fatalf("Cannot read private key: %v", err)
	}
	privPem, _ := pem.Decode(privBytes)
	if privPem == nil {
		log.Fatal("Invalid private key PEM")
	}
	privKey, err := x509.ParsePKCS8PrivateKey(privPem.Bytes)
	if err != nil {
		privKey, err = x509.ParsePKCS1PrivateKey(privPem.Bytes)
		if err != nil {
			log.Fatalf("Cannot parse private key: %v", err)
		}
	}
	PrivateKey = privKey.(*rsa.PrivateKey)

	pubBytes, err := ioutil.ReadFile(publicPath)
	if err != nil {
		log.Fatalf("Cannot read public key: %v", err)
	}
	pubPem, _ := pem.Decode(pubBytes)
	if pubPem == nil {
		log.Fatal("Invalid public key PEM")
	}
	pubKey, err := x509.ParsePKIXPublicKey(pubPem.Bytes)
	if err != nil {
		log.Fatalf("Cannot parse public key: %v", err)
	}
	PublicKey = pubKey.(*rsa.PublicKey)
}
